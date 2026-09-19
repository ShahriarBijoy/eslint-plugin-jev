import { resolveSettings, DEFAULT_SETTINGS } from "../../src/config/settings.js";

describe("resolveSettings", () => {
  it("returns defaults for undefined", () => { expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS); });
  it("overrides known keys and ignores unknown or wrongly typed ones", () => {
    const s = resolveSettings({ model: "jev-1.13.0", timeoutMs: "slow", concurrency: 2, bogus: 1, ignoreNames: ["^x"] });
    expect(s.model).toBe("jev-1.13.0");
    expect(s.timeoutMs).toBe(8000);
    expect(s.concurrency).toBe(2);
    expect(s.ignoreNames).toEqual(["^x"]);
    expect((s as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });
  it("clamps concurrency to 1..16", () => {
    expect(resolveSettings({ concurrency: 0 }).concurrency).toBe(1);
    expect(resolveSettings({ concurrency: 99 }).concurrency).toBe(16);
  });
  it("rejects zero or negative numeric settings", () => {
    expect(resolveSettings({ timeoutMs: -100, maxFunctionTokens: 0 }).timeoutMs).toBe(8000);
    expect(resolveSettings({ timeoutMs: -100, maxFunctionTokens: 0 }).maxFunctionTokens).toBe(6000);
  });
  it("rounds concurrency to integer before clamping", () => {
    expect(resolveSettings({ concurrency: 2.7 }).concurrency).toBe(3);
  });
  it("validates ignoreNames patterns for regex compilability", () => {
    expect(resolveSettings({ ignoreNames: ["^ok", "(unclosed"] }).ignoreNames).toEqual(["^ok"]);
  });
  it("allows empty ignoreNames array from user", () => {
    expect(resolveSettings({ ignoreNames: [] }).ignoreNames).toEqual([]);
  });
  it("defaults provider to auto", () => {
    expect(resolveSettings(undefined).provider).toBe("auto");
    expect(resolveSettings({}).provider).toBe("auto");
  });
  it("accepts a valid provider literal", () => {
    expect(resolveSettings({ provider: "typesafe" }).provider).toBe("typesafe");
    expect(resolveSettings({ provider: "openrouter" }).provider).toBe("openrouter");
    expect(resolveSettings({ provider: "auto" }).provider).toBe("auto");
  });
  it("falls back to auto for an invalid provider value", () => {
    expect(resolveSettings({ provider: "bogus" }).provider).toBe("auto");
    expect(resolveSettings({ provider: 42 }).provider).toBe("auto");
  });
});
