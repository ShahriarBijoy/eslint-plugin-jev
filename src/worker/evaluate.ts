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
  const apiKey = "apiKey" in deps ? deps.apiKey : resolveApiKey(req.cwd);
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

  if (!apiKey) { res.errors.push({ kind: "no_key", message: "eslint-plugin-jev: TYPESAFE_API_KEY not set (env, .env, or ~/.config/jev/config.json). Jev rules are skipped." }); return res; }
  const client: JevClient = deps.client ?? (new TypeSafeClient({ apiKey, defaultModel: req.model, timeout: Math.max(1000, req.timeoutMs), logLevel: "off" }) as unknown as JevClient);

  // 2. Fan out per unit with a concurrency cap and one per-file deadline.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  const queue = [...misses];
  const worker = async (): Promise<void> => {
    for (let unit = queue.shift(); unit; unit = queue.shift()) {
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
        res.errors.push({ unitId: unit.id, ...classify(err, unit.name, req.timeoutMs) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(req.concurrency, misses.length) }, worker));
  clearTimeout(timer);
  return res;
}

function classify(err: unknown, name: string, timeoutMs: number): Omit<EvaluateError, "unitId"> {
  const e = err as { name?: string; status?: number; message?: string; body?: unknown };
  const msg = e?.message ?? String(err);
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") return { kind: "timeout", message: `${name}: file deadline of ${timeoutMs} ms reached.` };
  if (e?.status === 429) return { kind: "rate_limit", message: `${name}: TypeSafe rate limit (429) after retries.` };
  if (e?.status === 400 && /max_tokens_exceeded|too large|token/i.test(JSON.stringify(e.body ?? msg))) return { kind: "too_large", message: `${name}: request exceeds the model's token limit.` };
  if (typeof e?.status === "number") return { kind: "api", message: `${name}: TypeSafe API error ${e.status}: ${msg}` };
  if (e?.name === "APITimeoutError" || e?.name === "APIConnectionError") return { kind: "transport", message: `${name}: could not reach api.typesafe.ai (${msg}).` };
  return { kind: "transport", message: `${name}: ${msg}` };
}
