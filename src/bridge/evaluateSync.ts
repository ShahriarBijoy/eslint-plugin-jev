import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSyncFn } from "synckit";
import type { Answer, EvaluateError, EvaluateRequest, EvaluateResponse } from "../types.js";

let syncFn: ((req: EvaluateRequest) => EvaluateResponse) | undefined;

export function evaluateSync(req: EvaluateRequest): EvaluateResponse {
  try {
    if (process.env.JEV_FAKE_ANSWERS) return fake(req);
    if (!syncFn) {
      const workerPath = fileURLToPath(new URL("./worker.js", import.meta.url));
      // synckit caches one sync function per worker path; the per-file deadline is
      // enforced inside the worker, this timeout is only a safety net.
      syncFn = createSyncFn(workerPath, { timeout: req.timeoutMs + 2000 }) as (req: EvaluateRequest) => EvaluateResponse;
    }
    return syncFn(req);
  } catch (err) {
    return workerError(err);
  }
}

function workerError(err: unknown): EvaluateResponse {
  return { answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors: [{ kind: "worker", message: (err as Error).message }] };
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
