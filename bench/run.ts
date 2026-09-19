import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluate } from "../src/worker/evaluate.js";
import { nameMatchesBodyQuestions, commentMatchesCodeQuestions, helpfulErrorMessageQuestions } from "../src/questions/specs.js";
import { unitState, stateText } from "../src/questions/build.js";
import type { FunctionUnit, Question } from "../src/types.js";

const QUESTIONS: Record<string, (u: FunctionUnit) => Record<string, Question>> = {
  "name-matches-body": () => ({ main: nameMatchesBodyQuestions().main }),
  "comment-matches-code": () => commentMatchesCodeQuestions(),
  "helpful-error-message": (u) => helpfulErrorMessageQuestions(u),
};
const model = process.env.JEV_MODEL ?? "jev-latest";
mkdirSync("bench/results", { recursive: true });
for (const file of readdirSync("bench/labels").filter((f) => f.endsWith(".jsonl"))) {
  const rule = file.replace(".jsonl", "");
  const cases = readFileSync(join("bench/labels", file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; expected: boolean; unit: Partial<FunctionUnit> });
  const units = cases.map((c, i) => {
    const u = { id: `c${i}`, kind: "declaration", nameLoc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, bodyStartLine: 1, rawBody: "", comment: undefined, throws: [], estimatedTokens: 0, ...c.unit } as FunctionUnit;
    u.estimatedTokens = Math.ceil((u.signature + (u.comment ?? "") + u.body).length / 4);
    const state = unitState(u);
    return { id: u.id, name: u.name, state, stateText: stateText(state), questions: QUESTIONS[rule](u), estimatedTokens: u.estimatedTokens };
  });
  const res = await evaluate({ filename: rule, cwd: process.cwd(), model, timeoutMs: 60_000, concurrency: 4, cacheDir: "bench/.cache", maxFunctionTokens: 6000, units, provider: "typesafe" });
  const rows = cases.map((c, i) => { const a = res.answers[`c${i}`] ?? {}; const p = Math.max(...Object.values(a).map((x) => x.noul ?? 0), 0); return { id: c.id, expected: c.expected, p }; });
  writeFileSync(`bench/results/${rule}.json`, JSON.stringify({ model: res.model, usage: res.usage, errors: res.errors, rows }, null, 2));
  console.log(`${rule}: ${rows.length} cases, ${res.fetched} fetched, ${res.cached} cached, ${res.usage.input_tokens} input tokens, ${res.errors.length} errors`);
}
