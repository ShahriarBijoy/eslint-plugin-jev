import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlCache, cacheKey } from "../../src/worker/cache.js";

async function lineBytes(model = "m", key = "kx"): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "jevprobe-"));
  const c = new JsonlCache(dir);
  await c.load();
  await c.set(key, { noul: 0.1 }, model);
  return statSync(join(dir, "answers.jsonl")).size;
}

describe("cacheKey", () => {
  it("changes with provider, model, question and state", () => {
    const q = { type: "noul" as const, instructions: "x" };
    const a = cacheKey("typesafe", "jev-1.13.0", q, "s");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey("openrouter", "jev-1.13.0", q, "s")).not.toBe(a);
    expect(cacheKey("typesafe", "jev-1.12.0", q, "s")).not.toBe(a);
    expect(cacheKey("typesafe", "jev-1.13.0", { ...q, instructions: "y" }, "s")).not.toBe(a);
    expect(cacheKey("typesafe", "jev-1.13.0", q, "t")).not.toBe(a);
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
    const L = await lineBytes();
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c = new JsonlCache(dir, { maxBytes: 2 * L + 4 });
    await c.set("ka", { noul: 0.1 }, "m");
    await c.set("kb", { noul: 0.2 }, "m");
    await c.set("ka", { noul: 0.9 }, "m");
    expect(c.get("ka")).toEqual({ noul: 0.9 });
    expect(c.get("kb")).toBeUndefined();
    const c2 = new JsonlCache(dir);
    await c2.load();
    expect(c2.get("ka")).toEqual({ noul: 0.9 });
    expect(c2.get("kb")).toBeUndefined();
  });
  it("preserves each entry's model when rewriting", async () => {
    const L = await lineBytes("m1");
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c = new JsonlCache(dir, { maxBytes: 3 * L + 4 });
    await c.set("k1", { noul: 0.1 }, "m1");
    await c.set("k2", { noul: 0.2 }, "m2");
    await c.set("k3", { noul: 0.3 }, "m3");
    await c.set("k4", { noul: 0.4 }, "m4");
    const content = readFileSync(join(dir, "answers.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(content).toContain('"model":"m3"');
    expect(content).toContain('"model":"m4"');
  });
  it("counts bytes, not UTF-16 units", async () => {
    const seedLine = '{"key":"kz","answer":{"noul":0.3},"model":"m","ts":1}\n';
    const seedBytes = Buffer.byteLength(seedLine, "utf8");
    const L = await lineBytes("m", "kx");
    const cap = seedBytes + L;
    const dir1 = mkdtempSync(join(tmpdir(), "jevcache-"));
    writeFileSync(join(dir1, "answers.jsonl"), seedLine);
    const c1 = new JsonlCache(dir1, { maxBytes: cap });
    await c1.load();
    await c1.set("kx", { noul: 0.1 }, "m");
    const content1 = readFileSync(join(dir1, "answers.jsonl"), "utf8");
    expect(content1).toContain('"key":"kz"');
    const dir2 = mkdtempSync(join(tmpdir(), "jevcache-"));
    writeFileSync(join(dir2, "answers.jsonl"), seedLine);
    const c2 = new JsonlCache(dir2, { maxBytes: cap });
    await c2.load();
    await c2.set("ké", { noul: 0.1 }, "m");
    const content2 = readFileSync(join(dir2, "answers.jsonl"), "utf8");
    expect(content2).not.toContain('"key":"kz"');
  });
  it("serializes concurrent truncating writes", async () => {
    const L = await lineBytes();
    const dir = mkdtempSync(join(tmpdir(), "jevcache-"));
    const c = new JsonlCache(dir, { maxBytes: 2 * L + 4 });
    const keys = ["k1", "k2", "k3", "k4", "k5", "k6"];
    await Promise.all(keys.map((k, i) => c.set(k, { noul: i / 10 }, "m")));
    const content = readFileSync(join(dir, "answers.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const c2 = new JsonlCache(dir);
    await c2.load();
    for (const k of keys) {
      expect(c2.get(k)).toEqual(c.get(k));
    }
  });
});
