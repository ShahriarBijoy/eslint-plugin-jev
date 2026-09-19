import { evaluateSync } from "../../src/bridge/evaluateSync.js";

describe("evaluateSync fake mode", () => {
  beforeEach(() => { process.env.JEV_FAKE_ANSWERS = new URL("../fixtures/fake-answers.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"); delete process.env.JEV_FAKE_ERRORS; });
  afterEach(() => { delete process.env.JEV_FAKE_ANSWERS; delete process.env.JEV_FAKE_ERRORS; });

  it("returns scripted answers by unit name and zeros for unknown questions", () => {
    const res = evaluateSync({ filename: "a.ts", cwd: ".", model: "m", timeoutMs: 100, concurrency: 1, cacheDir: "x", maxFunctionTokens: 6000,
      units: [{ id: "f0", name: "getUser", state: {}, stateText: "", estimatedTokens: 1, questions: { "name-matches-body:main": { type: "noul", instructions: "" }, "other": { type: "noul", instructions: "" } } }] });
    expect(res.answers.f0["name-matches-body:main"]).toEqual({ noul: 0.94 });
    expect(res.answers.f0.other).toEqual({ noul: 0 });
    expect(res.fetched).toBe(2);
  });
  it("returns scripted errors", () => {
    process.env.JEV_FAKE_ERRORS = JSON.stringify([{ kind: "no_key", message: "nope" }]);
    const res = evaluateSync({ filename: "a.ts", cwd: ".", model: "m", timeoutMs: 100, concurrency: 1, cacheDir: "x", maxFunctionTokens: 6000, units: [] });
    expect(res.errors).toEqual([{ kind: "no_key", message: "nope" }]);
  });

  it("returns a worker error instead of throwing when the fake file is missing", () => {
    process.env.JEV_FAKE_ANSWERS = "/no/such/file.json";
    const res = evaluateSync({ filename: "a.ts", cwd: ".", model: "m", timeoutMs: 100, concurrency: 1, cacheDir: "x", maxFunctionTokens: 6000, units: [] });
    expect(res.errors[0].kind).toBe("worker");
  });

  it("returns a worker error when JEV_FAKE_ERRORS is malformed", () => {
    process.env.JEV_FAKE_ERRORS = "{not json";
    const res = evaluateSync({ filename: "a.ts", cwd: ".", model: "m", timeoutMs: 100, concurrency: 1, cacheDir: "x", maxFunctionTokens: 6000, units: [] });
    expect(res.errors[0].kind).toBe("worker");
  });
});
