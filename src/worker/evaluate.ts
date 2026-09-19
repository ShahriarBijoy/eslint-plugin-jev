import { TypeSafeClient } from "@typesafe-ai/sdk";
import { resolve } from "node:path";
import type { Answer, EvaluateError, EvaluateRequest, EvaluateResponse, EvaluateUnit, Provider, Question, UnitAnswers } from "../types.js";
import { resolveApiKey, resolveOpenRouterKey } from "../config/apiKey.js";
import { JsonlCache, cacheKey } from "./cache.js";
import { createOpenRouterClient } from "./openrouter.js";

export interface JevClient {
  systemOne(input: { state: unknown; questions: Record<string, Question>; model: string }, opts: { signal: AbortSignal }): Promise<{ model: string; answers: Record<string, Answer & { type: string }>; usage: { input_tokens: number; output_tokens: number } }>;
}
export interface EvaluateDeps { client?: JevClient; apiKey?: string; openrouterApiKey?: string; cache?: JsonlCache }

const REQUEST_TOKEN_BUDGET = 28_000;

export async function evaluate(req: EvaluateRequest, deps: EvaluateDeps = {}): Promise<EvaluateResponse> {
  const res: EvaluateResponse = { answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors: [] };
  const cache = deps.cache ?? new JsonlCache(resolve(req.cwd, req.cacheDir));
  if (!deps.cache) await cache.load();

  // Only look up a key when its absence would change something we need right now. For an explicit
  // "typesafe" or "openrouter" provider the backend is fixed by settings alone, so key lookup waits
  // until after the cache pass below — a fully cached run never touches the environment, .env, or
  // the global config file. "auto" is the one case whose backend identity depends on which key
  // exists (so the cache can be namespaced correctly), so it alone must probe here, and it
  // short-circuits: the OpenRouter key is only checked if the TypeSafe key is absent.
  let tsKey: string | undefined;
  let orKey: string | undefined;
  if (req.provider === "auto") {
    tsKey = "apiKey" in deps ? deps.apiKey : resolveApiKey(req.cwd);
    if (!tsKey) orKey = "openrouterApiKey" in deps ? deps.openrouterApiKey : resolveOpenRouterKey(req.cwd);
  }
  const backend = resolveBackend(req.provider, tsKey, orKey).backend;

  // 1. Serve everything possible from cache, collect misses per unit.
  const misses: EvaluateUnit[] = [];
  for (const unit of req.units) {
    const ua: UnitAnswers = {};
    const missing: Record<string, Question> = {};
    for (const [qid, q] of Object.entries(unit.questions)) {
      const hit = cache.get(cacheKey(backend, req.model, q, unit.stateText));
      if (hit) { ua[qid] = hit; res.cached++; } else missing[qid] = q;
    }
    res.answers[unit.id] = ua;
    if (Object.keys(missing).length) misses.push({ ...unit, questions: missing });
  }
  if (!misses.length) return res;

  // A network call is now unavoidable. Explicit providers deferred their key lookup until now;
  // "auto" already resolved whichever key(s) it needed above, so this is a no-op for it.
  if (req.provider === "typesafe") tsKey = "apiKey" in deps ? deps.apiKey : resolveApiKey(req.cwd);
  if (req.provider === "openrouter") orKey = "openrouterApiKey" in deps ? deps.openrouterApiKey : resolveOpenRouterKey(req.cwd);
  const { apiKey } = resolveBackend(req.provider, tsKey, orKey);

  const NO_KEY_HINT = "(env, .env, or ~/.config/jev/config.json). Jev rules are skipped.";
  if (!apiKey) {
    const message = req.provider === "openrouter"
      ? `eslint-plugin-jev: OPENROUTER_API_KEY not set ${NO_KEY_HINT}`
      : req.provider === "typesafe"
        ? `eslint-plugin-jev: TYPESAFE_API_KEY not set ${NO_KEY_HINT}`
        : `eslint-plugin-jev: neither TYPESAFE_API_KEY nor OPENROUTER_API_KEY is set ${NO_KEY_HINT}`;
    res.errors.push({ kind: "no_key", message });
    return res;
  }
  const client: JevClient = deps.client ?? (backend === "typesafe"
    ? (new TypeSafeClient({ apiKey, defaultModel: req.model, timeout: Math.max(1000, req.timeoutMs), logLevel: "off" }) as unknown as JevClient)
    : createOpenRouterClient(apiKey, req.timeoutMs));

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
          await cache.set(cacheKey(backend, req.model, unit.questions[qid], unit.stateText), answer, out.model);
        }
      } catch (err) {
        // If another worker already declared the fatal, this failure is just a side effect of
        // that worker's controller.abort() (or a race that lost) — leave the unit unanswered
        // rather than reporting a second, misleading per-unit error.
        if (fatalPushed) continue;
        const { fatal, ...info } = classify(err, unit.name, req.timeoutMs, backend);
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

/**
 * Picks the backend that will actually serve the request, and the key that goes with it.
 * "auto" tries the TypeSafe key first, then the OpenRouter key, and falls back to a keyless
 * "typesafe" backend (the caller reports no_key only if that backend then has cache misses).
 * For an explicit provider, the backend is that value and the key is whichever one matches
 * (possibly undefined).
 */
function resolveBackend(provider: Provider, tsKey: string | undefined, orKey: string | undefined): { backend: "typesafe" | "openrouter"; apiKey?: string } {
  if (provider === "openrouter") return { backend: "openrouter", apiKey: orKey };
  if (provider === "typesafe") return { backend: "typesafe", apiKey: tsKey };
  if (tsKey) return { backend: "typesafe", apiKey: tsKey };
  if (orKey) return { backend: "openrouter", apiKey: orKey };
  return { backend: "typesafe", apiKey: undefined };
}

function classify(err: unknown, name: string, timeoutMs: number, provider: "typesafe" | "openrouter"): Omit<EvaluateError, "unitId"> & { fatal?: boolean } {
  const e = err as { name?: string; status?: number; message?: string; body?: unknown };
  const msg = e?.message ?? String(err);
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") return { kind: "timeout", message: `${name}: file deadline of ${timeoutMs} ms reached.` };
  const label = provider === "openrouter" ? "OpenRouter" : "TypeSafe";
  const envVar = provider === "openrouter" ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY";
  const host = provider === "openrouter" ? "openrouter.ai" : "api.typesafe.ai";
  // 401/403 mean the key itself is bad: no retry or per-unit granularity will help, so this is
  // fatal for the whole file. Never echo the key; only the HTTP status is user data here.
  if (e?.status === 401 || e?.status === 403) return { kind: "api", message: `${label} rejected the API key (HTTP ${e.status}). Check ${envVar}.`, fatal: true };
  // OpenRouter returns 402 when the account is out of credits; every other unit in the file will
  // fail the same way, so this is fatal like 401/403 rather than a per-unit error.
  if (provider === "openrouter" && e?.status === 402) {
    return { kind: "api", message: `${label} account is out of credits (HTTP 402). Add credits at https://openrouter.ai/credits.`, fatal: true };
  }
  // The TypeSafe SDK retries a 429 twice before surfacing it, so "after retries" is accurate there;
  // the OpenRouter fetch client never retries, so that wording would be false for it.
  if (e?.status === 429) {
    const suffix = provider === "typesafe" ? "rate limit (429) after retries." : "rate limit (429).";
    return { kind: "rate_limit", message: `${name}: ${label} ${suffix}` };
  }
  if (e?.status === 400 && /max_tokens_exceeded|too large|token/i.test(JSON.stringify(e.body ?? msg))) return { kind: "too_large", message: `${name}: request exceeds the model's token limit.` };
  if (typeof e?.status === "number") return { kind: "api", message: `${name}: ${label} API error ${e.status}: ${msg}` };
  // Transport failures (DNS/connection refused/etc.) and anything else unclassified mean the API
  // is unreachable for every unit in the file, not just this one, so they are also fatal.
  return { kind: "transport", message: `could not reach ${host} (${msg}).`, fatal: true };
}
