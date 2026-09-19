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
  it("keeps the entry just updated when truncating", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c = new JsonlCache(dir, { maxBytes: 100 });
    await c.set("a", { noul: 0.1 }, "m");
    await c.set("b", { noul: 0.2 }, "m");
    await c.set("a", { noul: 0.5 }, "m");
    expect(c.get("a")).toEqual({ noul: 0.5 });
  });
  it("preserves each entry's model when rewriting", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c = new JsonlCache(dir, { maxBytes: 250 });
    await c.set("a", { noul: 0.1 }, "m1");
    await c.set("b", { noul: 0.2 }, "m2");
    await c.set("c", { noul: 0.3 }, "m3");
    const content = readFileSync(join(dir, "answers.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    expect(content).toContain('"model":"m1"');
    expect(content).toContain('"model":"m2"');
  });
  it("serializes concurrent sets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c = new JsonlCache(dir);
    await Promise.all([
      c.set("k1", { noul: 0.1 }, "m"),
      c.set("k2", { noul: 0.2 }, "m"),
      c.set("k3", { noul: 0.3 }, "m"),
    ]);
    const c2 = new JsonlCache(dir);
    await c2.load();
    expect(c2.get("k1")).toEqual({ noul: 0.1 });
    expect(c2.get("k2")).toEqual({ noul: 0.2 });
    expect(c2.get("k3")).toEqual({ noul: 0.3 });
  });
  it("counts bytes, not UTF-16 units", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const asciiAnswer = { noul: 0.1 };
    const multibyteAnswer = { noul: 0.1, choice: "é" };
    const asciiLine = JSON.stringify({ key: "ascii", answer: asciiAnswer, model: "m", ts: 1 }) + "\n";
    const multibyteLineLen = Buffer.byteLength(JSON.stringify({ key: "multi", answer: multibyteAnswer, model: "m", ts: 1 }) + "\n", "utf8");
    const cap = Buffer.byteLength(asciiLine, "utf8") + 1;
    const c = new JsonlCache(dir, { maxBytes: cap });
    await c.set("ascii", asciiAnswer, "m");
    expect(c.get("ascii")).toEqual(asciiAnswer);
    await c.set("multi", multibyteAnswer, "m");
    const content = readFileSync(join(dir, "answers.jsonl"), "utf8");
    expect(content).toContain('"key":"multi"');
    expect(content).not.toContain('"key":"ascii"');
  });
});
