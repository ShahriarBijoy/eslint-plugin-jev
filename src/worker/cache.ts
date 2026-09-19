import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Answer, Question } from "../types.js";

export function cacheKey(model: string, question: Question, stateText: string): string {
  return createHash("sha256").update(JSON.stringify([model, question, stateText])).digest("hex");
}

interface Entry { answer: Answer; model: string; ts: number }
interface Line { key: string; answer: Answer; model: string; ts: number }

export class JsonlCache {
  private index = new Map<string, Entry>();
  private file: string;
  private maxBytes: number;
  private writing: Promise<void> = Promise.resolve();
  constructor(private dir: string, opts: { maxBytes?: number } = {}) {
    this.file = join(dir, "answers.jsonl");
    this.maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
  }
  async load(): Promise<void> {
    let text = "";
    try { text = await fs.readFile(this.file, "utf8"); } catch { return; }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try { const l = JSON.parse(line) as Line; if (l.key && l.answer) this.index.set(l.key, { answer: l.answer, model: l.model, ts: l.ts }); } catch { /* skip corrupt line */ }
    }
  }
  get(key: string): Answer | undefined { return this.index.get(key)?.answer; }
  async set(key: string, answer: Answer, model: string): Promise<void> {
    this.index.delete(key);
    this.index.set(key, { answer, model, ts: Date.now() });
    this.writing = this.writing.then(() => this.flush(key)).catch(() => {});
    return this.writing;
  }
  private async flush(key: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const entry = this.index.get(key)!;
    const line = JSON.stringify({ key, answer: entry.answer, model: entry.model, ts: entry.ts } satisfies Line) + "\n";
    let size = 0;
    try { size = (await fs.stat(this.file)).size; } catch { /* new file */ }
    if (size + Buffer.byteLength(line, "utf8") > this.maxBytes) {
      const keep = [...this.index.entries()].slice(-Math.max(1, Math.floor(this.index.size / 2)));
      this.index = new Map(keep);
      await fs.writeFile(this.file, keep.map(([k, e]) => JSON.stringify({ key: k, answer: e.answer, model: e.model, ts: e.ts })).join("\n") + "\n");
      return;
    }
    await fs.appendFile(this.file, line);
  }
}
