import type { Answer } from "../types.js";
import type { JevClient } from "./evaluate.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

/** Namespaces a bare Jev model id for OpenRouter; ids that already carry a "/" pass through untouched. */
export function openRouterModelId(model: string): string {
  return model.includes("/") ? model : `typesafe/${model}`;
}

/**
 * Builds a JevClient backed by OpenRouter's decisions endpoint. `timeoutMs` is accepted to match
 * the TypeSafe SDK client's shape but is intentionally unused: the caller's AbortSignal (the
 * per-file deadline in evaluate()) is the single source of truth for cancellation, so this client
 * never races its own timer against that signal.
 */
export function createOpenRouterClient(apiKey: string, timeoutMs: number): JevClient {
  void timeoutMs;
  return {
    async systemOne(input, opts) {
      const res = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/ShahriarBijoy/eslint-plugin-jev",
          "X-Title": "eslint-plugin-jev",
        },
        body: JSON.stringify({ model: openRouterModelId(input.model), state: input.state, questions: input.questions }),
        signal: opts.signal,
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200);
        throw Object.assign(new Error(text), { status: res.status });
      }
      return (await res.json()) as { model: string; answers: Record<string, Answer & { type: string }>; usage: { input_tokens: number; output_tokens: number } };
    },
  };
}
