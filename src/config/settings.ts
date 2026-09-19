import type { Settings } from "../types.js";

export const DEFAULT_SETTINGS: Settings = {
  model: "jev-latest", timeoutMs: 8000, maxFunctionTokens: 6000, concurrency: 6,
  cacheDir: "node_modules/.cache/eslint-plugin-jev", strict: false,
  ignoreNames: ["^use[A-Z]", "^on[A-Z]", "^handle[A-Z]", "^toJSON$"],
};

export function resolveSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: keyof Settings) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string) : (DEFAULT_SETTINGS[k] as string));
  const num = (k: keyof Settings) => (typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : (DEFAULT_SETTINGS[k] as number));
  return {
    model: str("model"), timeoutMs: num("timeoutMs"), maxFunctionTokens: num("maxFunctionTokens"),
    concurrency: Math.min(16, Math.max(1, num("concurrency"))),
    cacheDir: str("cacheDir"), strict: r.strict === true,
    ignoreNames: Array.isArray(r.ignoreNames) && r.ignoreNames.every((x) => typeof x === "string") ? (r.ignoreNames as string[]) : DEFAULT_SETTINGS.ignoreNames,
  };
}
