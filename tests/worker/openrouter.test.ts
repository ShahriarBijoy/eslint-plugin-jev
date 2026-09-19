import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenRouterClient, openRouterModelId } from "../../src/worker/openrouter.js";
import { evaluate } from "../../src/worker/evaluate.js";
import type { EvaluateRequest } from "../../src/types.js";

describe("openRouterModelId", () => {
  it("prefixes a bare model id with typesafe/", () => {
    expect(openRouterModelId("jev-latest")).toBe("typesafe/jev-latest");
    expect(openRouterModelId("jev-1.13")).toBe("typesafe/jev-1.13");
  });
  it("leaves an already-namespaced id untouched", () => {
    expect(openRouterModelId("typesafe/jev-latest")).toBe("typesafe/jev-latest");
    expect(openRouterModelId("other/jev-latest")).toBe("other/jev-latest");
  });
});

describe("createOpenRouterClient", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("sends the bearer and attribution headers plus {model,state,questions}, and returns the parsed body", async () => {
    const body = { model: "jev-1.13.0", answers: { main: { type: "noul", noul: 0.7 } }, usage: { input_tokens: 10, output_tokens: 2 } };
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer secret-key");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["HTTP-Referer"]).toBe("https://github.com/ShahriarBijoy/eslint-plugin-jev");
      expect(headers["X-Title"]).toBe("eslint-plugin-jev");
      expect(JSON.parse(init.body as string)).toEqual({ model: "typesafe/jev-latest", state: { a: 1 }, questions: { main: { type: "noul", instructions: "q" } } });
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterClient("secret-key", 8000);
    const controller = new AbortController();
    const out = await client.systemOne({ state: { a: 1 }, questions: { main: { type: "noul", instructions: "q" } }, model: "jev-latest" }, { signal: controller.signal });
    expect(out).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the caller's AbortSignal through to fetch", async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenSignal = init.signal as AbortSignal;
      return new Response(JSON.stringify({ model: "m", answers: {}, usage: { input_tokens: 0, output_tokens: 0 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterClient("k", 8000);
    const controller = new AbortController();
    await client.systemOne({ state: {}, questions: {}, model: "jev-latest" }, { signal: controller.signal });
    expect(seenSignal).toBe(controller.signal);
  });

  it("throws Object.assign(new Error(text.slice(0,200)), { status }) on a non-2xx response, without retrying", async () => {
    const longBody = "x".repeat(300);
    const fetchMock = vi.fn(async () => new Response(longBody, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterClient("k", 8000);
    const controller = new AbortController();
    await expect(client.systemOne({ state: {}, questions: {}, model: "jev-latest" }, { signal: controller.signal }))
      .rejects.toMatchObject({ status: 401, message: "x".repeat(200) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the status text, then a bare status code, when the error body is empty", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 402, statusText: "Payment Required" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterClient("k", 8000);
    const controller = new AbortController();
    await expect(client.systemOne({ state: {}, questions: {}, model: "jev-latest" }, { signal: controller.signal }))
      .rejects.toMatchObject({ status: 402, message: "Payment Required" });
  });

  it("propagates a network failure as-is", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterClient("k", 8000);
    const controller = new AbortController();
    await expect(client.systemOne({ state: {}, questions: {}, model: "jev-latest" }, { signal: controller.signal }))
      .rejects.toThrow("ECONNREFUSED");
  });
});

describe("evaluate() end-to-end abort through the real OpenRouter client", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reports a timeout (not a fatal transport error) when the per-file deadline aborts an in-flight request, and does not hang", async () => {
    // Never resolves on its own; only rejects once evaluate()'s per-file deadline aborts the signal
    // it was given, mirroring how a real fetch behaves when its AbortSignal fires mid-request.
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const req: EvaluateRequest = {
      filename: "a.ts", cwd: process.cwd(), model: "jev-latest", timeoutMs: 50, concurrency: 1,
      cacheDir: mkdtempSync(join(tmpdir(), "jevor-")), maxFunctionTokens: 6000, provider: "openrouter",
      units: [{ id: "f0", name: "getUser", state: { function: { name: "getUser" } }, stateText: '{"function":{"name":"getUser"}}', estimatedTokens: 10,
        questions: { main: { type: "noul", instructions: "q" } } }],
    };
    const res = await evaluate(req, { apiKey: undefined, openrouterApiKey: "k" });
    expect(res.errors).toEqual([{ unitId: "f0", kind: "timeout", message: expect.any(String) }]);
  });
});
