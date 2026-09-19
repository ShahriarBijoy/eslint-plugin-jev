import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlCache, cacheKey } from "../../src/worker/cache.js";

describe("cacheKey", () => {
  it("changes with model, question and state", () => {
    const q = { type: "noul" as const, instructions: "x" };
    const a = cacheKey("jev-1.13.0", q, "s");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey("jev-1.12.0", q, "s")).not.toBe(a);
    expect(cacheKey("jev-1.13.0", { ...q, instructions: "y" }, "s")).not.toBe(a);
    expect(cacheKey("jev-1.13.0", q, "t")).not.toBe(a);
  });
});

describe("JsonlCache", () => {
  it("round trips answers across instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c1 = new JsonlCache(dir);
    await c1.load();
    expect(c1.get("k")).toBeUndefined();
    await c1.set("k", { noul: 0.9 }, "jev-1.13.0");
    const c2 = new JsonlCache(dir);
    await c2.load();
    expect(c2.get("k")).toEqual({ noul: 0.9 });
  });
  it("ignores corrupt lines and truncates when over the byte cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    writeFileSync(join(dir, "answers.jsonl"), 'not json\n{"key":"a","answer":{"noul":0.1},"model":"m","ts":1}\n');
    const c = new JsonlCache(dir, { maxBytes: 10 });
    await c.load();
    expect(c.get("a")).toEqual({ noul: 0.1 });
    await c.set("b", { noul: 0.2 }, "m");
    expect(statSync(join(dir, "answers.jsonl")).size).toBeLessThan(200);
    expect(readFileSync(join(dir, "answers.jsonl"), "utf8")).toContain('"key":"b"');
  });
});
