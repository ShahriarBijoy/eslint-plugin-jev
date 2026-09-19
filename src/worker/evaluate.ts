import { TypeSafeClient } from "@typesafe-ai/sdk";
import { resolve } from "node:path";
import type { Answer, EvaluateError, EvaluateRequest, EvaluateResponse, EvaluateUnit, Question, UnitAnswers } from "../types.js";
import { resolveApiKey } from "../config/apiKey.js";
import { JsonlCache, cacheKey } from "./cache.js";

export interface JevClient {
  systemOne(input: { state: unknown; questions: Record<string, Question>; model: string }, opts: { signal: AbortSignal }): Promise<{ model: string; answers: Record<string, Answer & { type: string }>; usage: { input_tokens: number; output_tokens: number } }>;
}
export interface EvaluateDeps { client?: JevClient; apiKey?: string; cache?: JsonlCache }

const REQUEST_TOKEN_BUDGET = 28_000;

export async function evaluate(req: EvaluateRequest, deps: EvaluateDeps = {}): Promise<EvaluateResponse> {
  const res: EvaluateResponse = { answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors: [] };
  const cache = deps.cache ?? new JsonlCache(resolve(req.cwd, req.cacheDir));
  if (!deps.cache) await cache.load();

  // 1. Serve everything possible from cache, collect misses per unit.
  const misses: EvaluateUnit[] = [];
  for (const unit of req.units) {
    const ua: UnitAnswers = {};
    const missing: Record<string, Question> = {};
    for (const [qid, q] of Object.entries(unit.questions)) {
      const hit = cache.get(cacheKey(req.model, q, unit.stateText));
      if (hit) { ua[qid] = hit; res.cached++; } else missing[qid] = q;
    }
    res.answers[unit.id] = ua;
    if (Object.keys(missing).length) misses.push({ ...unit, questions: missing });
  }
  if (!misses.length) return res;

  // Only look up the key once we know a network call is actually needed: a fully cached run
  // never touches the environment, .env, or the global config file.
  const apiKey = "apiKey" in deps ? deps.apiKey : resolveApiKey(req.cwd);
  if (!apiKey) { res.errors.push({ kind: "no_key", message: "eslint-plugin-jev: TYPESAFE_API_KEY not set (env, .env, or ~/.config/jev/config.json). Jev rules are skipped." }); return res; }
  const client: JevClient = deps.client ?? (new TypeSafeClient({ apiKey, defaultModel: req.model, timeout: Math.max(1000, req.timeoutMs), logLevel: "off" }) as unknown as JevClient);

  // 2. Fan out per unit with a concurrency cap and one per-file deadline.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  const queue = [...misses];
  // Set the moment any worker classifies an error as file-level fatal (invalid key, transport
  // unreachable). Guards against pushing the fatal more than once when several workers hit it
  // concurrently, and tells every worker to stop pulling from the shared queue.
  let fatalPushed = false;
  const worker = async (): Promise<void> => {
    for (let unit = queue.shift(); unit; unit = queue.shift()) {
      if (fatalPushed) break;
      const questionTokens = Math.ceil(JSON.stringify(unit.questions).length / 4);
      if (unit.estimatedTokens > req.maxFunctionTokens || unit.estimatedTokens + questionTokens > REQUEST_TOKEN_BUDGET) {
        res.errors.push({ unitId: unit.id, kind: "too_large", message: `${unit.name}: ~${unit.estimatedTokens} tokens exceeds the budget; raise settings.jev.maxFunctionTokens or split the function.` });
        continue;
      }
      if (controller.signal.aborted) { res.errors.push({ unitId: unit.id, kind: "timeout", message: `${unit.name}: skipped, file deadline of ${req.timeoutMs} ms reached.` }); continue; }
      try {
        const out = await client.systemOne({ state: unit.state, questions: unit.questions, model: req.model }, { signal: controller.signal });
        res.model = out.model;
        res.usage.input_tokens += out.usage?.input_tokens ?? 0;
        res.usage.output_tokens += out.usage?.output_tokens ?? 0;
        for (const [qid, raw] of Object.entries(out.answers)) {
          const { type: _t, ...answer } = raw;
          res.answers[unit.id][qid] = answer;
          res.fetched++;
          await cache.set(cacheKey(req.model, unit.questions[qid], unit.stateText), answer, out.model);
        }
      } catch (err) {
        // If another worker already declared the fatal, this failure is just a side effect of
        // that worker's controller.abort() (or a race that lost) — leave the unit unanswered
        // rather than reporting a second, misleading per-unit error.
        if (fatalPushed) continue;
        const { fatal, ...info } = classify(err, unit.name, req.timeoutMs);
        if (fatal) {
          fatalPushed = true;
          controller.abort();
          res.errors.push(info);
        } else {
          res.errors.push({ unitId: unit.id, ...info });
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(req.concurrency, misses.length) }, worker));
  } finally {
    clearTimeout(timer);
  }
  return res;
}

function classify(err: unknown, name: string, timeoutMs: number): Omit<EvaluateError, "unitId"> & { fatal?: boolean } {
  const e = err as { name?: string; status?: number; message?: string; body?: unknown };
  const msg = e?.message ?? String(err);
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") return { kind: "timeout", message: `${name}: file deadline of ${timeoutMs} ms reached.` };
  // 401/403 mean the key itself is bad: no retry or per-unit granularity will help, so this is
  // fatal for the whole file. Never echo the key; only the HTTP status is user data here.
  if (e?.status === 401 || e?.status === 403) return { kind: "api", message: `TypeSafe rejected the API key (HTTP ${e.status}). Check TYPESAFE_API_KEY.`, fatal: true };
  if (e?.status === 429) return { kind: "rate_limit", message: `${name}: TypeSafe rate limit (429) after retries.` };
  if (e?.status === 400 && /max_tokens_exceeded|too large|token/i.test(JSON.stringify(e.body ?? msg))) return { kind: "too_large", message: `${name}: request exceeds the model's token limit.` };
  if (typeof e?.status === "number") return { kind: "api", message: `${name}: TypeSafe API error ${e.status}: ${msg}` };
  // Transport failures (DNS/connection refused/etc.) and anything else unclassified mean the API
  // is unreachable for every unit in the file, not just this one, so they are also fatal.
  return { kind: "transport", message: `could not reach api.typesafe.ai (${msg}).`, fatal: true };
}
