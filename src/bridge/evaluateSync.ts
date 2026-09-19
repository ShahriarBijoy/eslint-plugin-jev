import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSyncFn } from "synckit";
import type { Answer, EvaluateError, EvaluateRequest, EvaluateResponse } from "../types.js";

let syncFn: ((req: EvaluateRequest) => EvaluateResponse) | undefined;
let currentTimeout = -1;

export function evaluateSync(req: EvaluateRequest): EvaluateResponse {
  if (process.env.JEV_FAKE_ANSWERS) return fake(req);
  const timeout = req.timeoutMs + 2000;
  if (!syncFn || currentTimeout !== timeout) {
    const workerPath = fileURLToPath(new URL("./worker.js", import.meta.url));
    syncFn = createSyncFn(workerPath, { timeout }) as (req: EvaluateRequest) => EvaluateResponse;
    currentTimeout = timeout;
  }
  try { return syncFn(req); }
  catch (err) { return { answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors: [{ kind: "worker", message: (err as Error).message }] }; }
}

function fake(req: EvaluateRequest): EvaluateResponse {
  const scripted = JSON.parse(readFileSync(process.env.JEV_FAKE_ANSWERS!, "utf8")) as Record<string, Record<string, Answer>>;
  const errors = process.env.JEV_FAKE_ERRORS ? (JSON.parse(process.env.JEV_FAKE_ERRORS) as EvaluateError[]) : [];
  const res: EvaluateResponse = { answers: {}, model: "fake", usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors };
  for (const unit of req.units) {
    res.answers[unit.id] = {};
    for (const qid of Object.keys(unit.questions)) { res.answers[unit.id][qid] = scripted[unit.name]?.[qid] ?? { noul: 0 }; res.fetched++; }
  }
  return res;
}
