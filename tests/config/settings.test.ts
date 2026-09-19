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
});
