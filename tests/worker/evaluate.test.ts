import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, type JevClient } from "../../src/worker/evaluate.js";
import { JsonlCache } from "../../src/worker/cache.js";
import type { EvaluateRequest } from "../../src/types.js";
import * as apiKeyModule from "../../src/config/apiKey.js";

function req(overrides: Partial<EvaluateRequest> = {}): EvaluateRequest {
  return {
    filename: "a.ts", cwd: process.cwd(), model: "jev-latest", timeoutMs: 2000, concurrency: 2,
    cacheDir: mkdtempSync(join(tmpdir(), "jevc-")), maxFunctionTokens: 6000, provider: "typesafe",
    units: [
      { id: "f0", name: "getUser", state: { function: { name: "getUser" } }, stateText: '{"function":{"name":"getUser"}}', estimatedTokens: 10,
        questions: { "name-matches-body:main": { type: "noul", instructions: "q" }, "name-matches-body:verb": { type: "choice", instructions: "v", criteria: { get: null, delete: null } } } },
      { id: "f1", name: "saveOrder", state: { function: { name: "saveOrder" } }, stateText: '{"function":{"name":"saveOrder"}}', estimatedTokens: 10,
        questions: { "name-matches-body:main": { type: "noul", instructions: "q" } } },
    ],
    ...overrides,
  };
}

function fakeClient(calls: unknown[] = []): JevClient {
  return {
    async systemOne(input) {
      calls.push(input);
      const answers: Record<string, { type: string; noul?: number; choice?: string; probabilities?: Record<string, number>; confidence?: number }> = {};
      for (const [id, q] of Object.entries(input.questions)) {
        answers[id] = q.type === "noul" ? { type: "noul", noul: 0.9 } : { type: "choice", choice: "delete", probabilities: { get: 0.1, delete: 0.9 }, confidence: 0.8 };
      }
      return { model: "jev-1.13.0", answers, usage: { input_tokens: 100, output_tokens: 5 } };
    },
  };
}

describe("evaluate", () => {
  it("sends one request per unit and returns typed answers", async () => {
    const calls: unknown[] = [];
    const res = await evaluate(req(), { client: fakeClient(calls), apiKey: "k" });
    expect(calls).toHaveLength(2);
    expect(res.answers.f0["name-matches-body:main"]).toEqual({ noul: 0.9 });
    expect(res.answers.f0["name-matches-body:verb"]).toEqual({ choice: "delete", probabilities: { get: 0.1, delete: 0.9 }, confidence: 0.8 });
    expect(res.fetched).toBe(3); expect(res.cached).toBe(0); expect(res.model).toBe("jev-1.13.0");
    expect(res.usage.input_tokens).toBe(200); expect(res.errors).toEqual([]);
  });
  it("serves repeated questions from the cache and only fetches misses", async () => {
    const r = req();
    const cache = new JsonlCache(r.cacheDir); await cache.load();
    await evaluate(r, { client: fakeClient(), apiKey: "k", cache });
    const calls: unknown[] = [];
    const res = await evaluate(r, { client: fakeClient(calls), apiKey: "k", cache });
    expect(calls).toHaveLength(0); expect(res.cached).toBe(3); expect(res.fetched).toBe(0);
  });
  it("reports no_key without calling the client", async () => {
    const calls: unknown[] = [];
    const res = await evaluate(req(), { client: fakeClient(calls), apiKey: undefined });
    expect(calls).toHaveLength(0);
    expect(res.errors).toEqual([{ kind: "no_key", message: expect.stringContaining("TYPESAFE_API_KEY") }]);
  });
  it("skips units over the token budget with a too_large error", async () => {
    const r = req({ maxFunctionTokens: 5 });
    r.units[0].estimatedTokens = 10; r.units[1].estimatedTokens = 1;
    const calls: unknown[] = [];
    const res = await evaluate(r, { client: fakeClient(calls), apiKey: "k" });
    expect(calls).toHaveLength(1);
    expect(res.errors).toEqual([{ unitId: "f0", kind: "too_large", message: expect.any(String) }]);
  });
  it("maps SDK errors to kinds per unit and keeps other units", async () => {
    const client: JevClient = { async systemOne(input) {
      if ((input.state as { function: { name: string } }).function.name === "getUser") { const e = new Error("limit") as Error & { status?: number }; e.status = 429; throw e; }
      return fakeClient().systemOne(input, { signal: new AbortController().signal });
    } };
    const res = await evaluate(req(), { client, apiKey: "k" });
    expect(res.errors).toEqual([{ unitId: "f0", kind: "rate_limit", message: expect.any(String) }]);
    expect(res.answers.f1["name-matches-body:main"]).toEqual({ noul: 0.9 });
  });
  it("aborts on the per-file timeout and reports timeout for unfinished units", async () => {
    const client: JevClient = { systemOne: (_i, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))) };
    const res = await evaluate(req({ timeoutMs: 50 }), { client, apiKey: "k" });
    expect(res.errors.map((e) => e.kind)).toEqual(["timeout", "timeout"]);
  });
  it("reports an invalid key once as a file-level error and stops", async () => {
    const calls: unknown[] = [];
    const client: JevClient = { async systemOne(input) { calls.push(input); throw Object.assign(new Error("Unauthorized"), { status: 401 }); } };
    const r = req({ concurrency: 1 });
    r.units.push({ id: "f2", name: "thirdUnit", state: { function: { name: "thirdUnit" } }, stateText: '{"function":{"name":"thirdUnit"}}', estimatedTokens: 10, questions: { "name-matches-body:main": { type: "noul", instructions: "q" } } });
    const res = await evaluate(r, { client, apiKey: "k" });
    expect(calls).toHaveLength(1);
    expect(res.errors).toEqual([{ kind: "api", message: expect.stringContaining("401") }]);
    expect(res.errors[0]).not.toHaveProperty("unitId");
    expect(res.errors[0].message).not.toContain("k=");
    expect(res.errors[0].message).toBe("TypeSafe rejected the API key (HTTP 401). Check TYPESAFE_API_KEY.");
  });
  it("reports a single fatal when two workers fail in the same tick", async () => {
    const calls: unknown[] = [];
    const client: JevClient = {
      async systemOne(input) {
        calls.push(input);
        return Promise.reject(Object.assign(new Error("Unauthorized"), { status: 401 }));
      },
    };
    const r = req({ concurrency: 2 });
    r.units.push(
      { id: "f2", name: "thirdUnit", state: { function: { name: "thirdUnit" } }, stateText: '{"function":{"name":"thirdUnit"}}', estimatedTokens: 10, questions: { "name-matches-body:main": { type: "noul", instructions: "q" } } },
      { id: "f3", name: "fourthUnit", state: { function: { name: "fourthUnit" } }, stateText: '{"function":{"name":"fourthUnit"}}', estimatedTokens: 10, questions: { "name-matches-body:main": { type: "noul", instructions: "q" } } },
    );
    const res = await evaluate(r, { client, apiKey: "k" });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).not.toHaveProperty("unitId");
    expect(res.errors[0].kind).toBe("api");
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it("reports a transport failure once as a file-level error", async () => {
    const calls: unknown[] = [];
    const client: JevClient = { async systemOne(input) { calls.push(input); throw Object.assign(new Error("ECONNREFUSED"), { name: "APIConnectionError" }); } };
    const r = req({ concurrency: 1 });
    r.units.push({ id: "f2", name: "thirdUnit", state: { function: { name: "thirdUnit" } }, stateText: '{"function":{"name":"thirdUnit"}}', estimatedTokens: 10, questions: { "name-matches-body:main": { type: "noul", instructions: "q" } } });
    const res = await evaluate(r, { client, apiKey: "k" });
    expect(calls).toHaveLength(1);
    expect(res.errors).toEqual([{ kind: "transport", message: expect.stringContaining("ECONNREFUSED") }]);
    expect(res.errors[0]).not.toHaveProperty("unitId");
  });

  describe("provider selection", () => {
    it("provider: openrouter with only a TypeSafe key present yields one no_key error naming OPENROUTER_API_KEY and makes no request", async () => {
      const calls: unknown[] = [];
      const res = await evaluate(req({ provider: "openrouter" }), { client: fakeClient(calls), apiKey: "ts-key", openrouterApiKey: undefined });
      expect(calls).toHaveLength(0);
      expect(res.errors).toEqual([{ kind: "no_key", message: expect.stringContaining("OPENROUTER_API_KEY") }]);
    });

    it("provider: openrouter reports one fatal error naming OPENROUTER_API_KEY on a 401, with no key material in the message", async () => {
      const calls: unknown[] = [];
      const client: JevClient = { async systemOne(input) { calls.push(input); throw Object.assign(new Error("Unauthorized"), { status: 401 }); } };
      const res = await evaluate(req({ provider: "openrouter", concurrency: 1 }), { client, apiKey: undefined, openrouterApiKey: "or-secret-key" });
      expect(res.errors).toEqual([{ kind: "api", message: "OpenRouter rejected the API key (HTTP 401). Check OPENROUTER_API_KEY." }]);
      expect(res.errors[0].message).not.toContain("or-secret-key");
    });

    it("provider: auto with both keys present uses TypeSafe", async () => {
      const client: JevClient = { async systemOne() { throw Object.assign(new Error("Unauthorized"), { status: 401 }); } };
      const res = await evaluate(req({ provider: "auto", concurrency: 1 }), { client, apiKey: "ts-key", openrouterApiKey: "or-key" });
      expect(res.errors[0].message).toBe("TypeSafe rejected the API key (HTTP 401). Check TYPESAFE_API_KEY.");
    });

    it("provider: auto with only an OpenRouter key uses the OpenRouter client", async () => {
      const client: JevClient = { async systemOne() { throw Object.assign(new Error("Unauthorized"), { status: 401 }); } };
      const res = await evaluate(req({ provider: "auto", concurrency: 1 }), { client, apiKey: undefined, openrouterApiKey: "or-key" });
      expect(res.errors[0].message).toBe("OpenRouter rejected the API key (HTTP 401). Check OPENROUTER_API_KEY.");
    });

    it("provider: auto reports one no_key error naming both keys when neither is set", async () => {
      const res = await evaluate(req({ provider: "auto" }), { client: fakeClient(), apiKey: undefined, openrouterApiKey: undefined });
      expect(res.errors).toEqual([{ kind: "no_key", message: expect.stringContaining("TYPESAFE_API_KEY") }]);
      expect(res.errors[0].message).toContain("OPENROUTER_API_KEY");
    });

    it("does not serve cache entries written under one provider to the other", async () => {
      const r = req();
      const cache = new JsonlCache(r.cacheDir); await cache.load();
      await evaluate({ ...r, provider: "typesafe" }, { client: fakeClient(), apiKey: "k", openrouterApiKey: undefined, cache });
      const calls: unknown[] = [];
      const res = await evaluate({ ...r, provider: "openrouter" }, { client: fakeClient(calls), apiKey: undefined, openrouterApiKey: "k", cache });
      expect(calls.length).toBeGreaterThan(0);
      expect(res.cached).toBe(0);
      expect(res.fetched).toBe(3);
    });

    it("auto and typesafe share a cache namespace", async () => {
      const r = req();
      const cache = new JsonlCache(r.cacheDir); await cache.load();
      await evaluate({ ...r, provider: "auto" }, { client: fakeClient(), apiKey: "k", openrouterApiKey: undefined, cache });
      const calls: unknown[] = [];
      const res = await evaluate({ ...r, provider: "typesafe" }, { client: fakeClient(calls), apiKey: "k", openrouterApiKey: undefined, cache });
      expect(calls).toHaveLength(0);
      expect(res.cached).toBe(3);
      expect(res.fetched).toBe(0);
    });

    it("a fully cached run with no key returns cached answers and no error", async () => {
      const r = req();
      const cache = new JsonlCache(r.cacheDir); await cache.load();
      await evaluate(r, { client: fakeClient(), apiKey: "k", openrouterApiKey: undefined, cache });
      const calls: unknown[] = [];
      const res = await evaluate(r, { client: fakeClient(calls), apiKey: undefined, openrouterApiKey: undefined, cache });
      expect(calls).toHaveLength(0);
      expect(res.errors).toEqual([]);
      expect(res.cached).toBe(3);
      expect(res.answers.f0["name-matches-body:main"]).toEqual({ noul: 0.9 });
    });

    it("provider: typesafe resolves no key at all before the cache pass (a fully cached run never probes the environment)", async () => {
      const r = req({ provider: "typesafe" });
      const cache = new JsonlCache(r.cacheDir); await cache.load();
      await evaluate(r, { client: fakeClient(), apiKey: "k", openrouterApiKey: undefined, cache });
      const tsSpy = vi.spyOn(apiKeyModule, "resolveApiKey");
      const orSpy = vi.spyOn(apiKeyModule, "resolveOpenRouterKey");
      const calls: unknown[] = [];
      // Deliberately omit apiKey/openrouterApiKey from deps: if evaluate() resolved either key
      // before finding the run fully cached, one of these spies would be called.
      const res = await evaluate(r, { client: fakeClient(calls), cache });
      expect(calls).toHaveLength(0);
      expect(res.errors).toEqual([]);
      expect(res.cached).toBe(3);
      expect(tsSpy).not.toHaveBeenCalled();
      expect(orSpy).not.toHaveBeenCalled();
      tsSpy.mockRestore(); orSpy.mockRestore();
    });

    it("provider: openrouter resolves no key at all before the cache pass", async () => {
      const r = req({ provider: "openrouter" });
      const cache = new JsonlCache(r.cacheDir); await cache.load();
      await evaluate(r, { client: fakeClient(), apiKey: undefined, openrouterApiKey: "k", cache });
      const tsSpy = vi.spyOn(apiKeyModule, "resolveApiKey");
      const orSpy = vi.spyOn(apiKeyModule, "resolveOpenRouterKey");
      const calls: unknown[] = [];
      const res = await evaluate(r, { client: fakeClient(calls), cache });
      expect(calls).toHaveLength(0);
      expect(res.errors).toEqual([]);
      expect(res.cached).toBe(3);
      expect(tsSpy).not.toHaveBeenCalled();
      expect(orSpy).not.toHaveBeenCalled();
      tsSpy.mockRestore(); orSpy.mockRestore();
    });

    it("integration: a real OpenRouter 401 (via stubbed fetch) becomes one fatal error naming OPENROUTER_API_KEY", async () => {
      const fetchMock = vi.fn(async () => new Response("Unauthorized: bad key", { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);
      try {
        const res = await evaluate(req({ provider: "openrouter", concurrency: 1 }), { apiKey: undefined, openrouterApiKey: "or-secret-key" });
        expect(res.errors).toEqual([{ kind: "api", message: "OpenRouter rejected the API key (HTTP 401). Check OPENROUTER_API_KEY." }]);
        expect(res.errors[0].message).not.toContain("or-secret-key");
        expect(fetchMock).toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
