import { createOpenRouterClient, openRouterModelId } from "../../src/worker/openrouter.js";

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

  it("propagates a network failure as-is", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterClient("k", 8000);
    const controller = new AbortController();
    await expect(client.systemOne({ state: {}, questions: {}, model: "jev-latest" }, { signal: controller.signal }))
      .rejects.toThrow("ECONNREFUSED");
  });
});
