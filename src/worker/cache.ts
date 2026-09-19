import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Answer, Question } from "../types.js";

export function cacheKey(model: string, question: Question, stateText: string): string {
  return createHash("sha256").update(JSON.stringify([model, question, stateText])).digest("hex");
}

interface Line { key: string; answer: Answer; model: string; ts: number }

export class JsonlCache {
  private index = new Map<string, Answer>();
  private file: string;
  private maxBytes: number;
  constructor(private dir: string, opts: { maxBytes?: number } = {}) {
    this.file = join(dir, "answers.jsonl");
    this.maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
  }
  async load(): Promise<void> {
    let text = "";
    try { text = await fs.readFile(this.file, "utf8"); } catch { return; }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try { const l = JSON.parse(line) as Line; if (l.key && l.answer) this.index.set(l.key, l.answer); } catch { /* skip corrupt line */ }
    }
  }
  get(key: string): Answer | undefined { return this.index.get(key); }
  async set(key: string, answer: Answer, model: string): Promise<void> {
    this.index.set(key, answer);
    await fs.mkdir(this.dir, { recursive: true });
    const line = JSON.stringify({ key, answer, model, ts: Date.now() } satisfies Line) + "\n";
    let size = 0;
    try { size = (await fs.stat(this.file)).size; } catch { /* new file */ }
    if (size + line.length > this.maxBytes) {
      const keep = [...this.index.entries()].slice(-Math.max(1, Math.floor(this.index.size / 2)));
      this.index = new Map(keep);
      await fs.writeFile(this.file, keep.map(([k, a]) => JSON.stringify({ key: k, answer: a, model, ts: Date.now() })).join("\n") + "\n");
      return;
    }
    await fs.appendFile(this.file, line);
  }
}
