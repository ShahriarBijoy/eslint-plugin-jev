import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveApiKey(cwd: string, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string | undefined {
  const fromEnv = env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromDotenv = readDotenv(join(cwd, ".env")).TYPESAFE_API_KEY;
  if (fromDotenv) return fromDotenv;
  try {
    const cfg = JSON.parse(readFileSync(join(home, ".config", "jev", "config.json"), "utf8")) as { apiKey?: string };
    if (typeof cfg.apiKey === "string" && cfg.apiKey.trim()) return cfg.apiKey.trim();
  } catch { /* no global config */ }
  return undefined;
}

function readDotenv(file: string): Record<string, string> {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return {}; }
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = line.slice(eq + 1).trim();
    const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
    if (quoted) {
      val = val.slice(1, -1);
    } else {
      const hashIdx = val.indexOf(" #");
      if (hashIdx >= 0) val = val.slice(0, hashIdx).trim();
    }
    out[key] = val;
  }
  return out;
}
