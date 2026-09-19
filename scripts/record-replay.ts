import { performance } from "node:perf_hooks";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";

let plugin: typeof import("../dist/index.js").default;
try { plugin = (await import("../dist/index.js")).default; }
catch { console.error("dist/ not found. Run `pnpm build` first."); process.exit(1); }

if (!process.env.TYPESAFE_API_KEY) { console.error("Set TYPESAFE_API_KEY"); process.exit(1); }
delete process.env.JEV_FAKE_ANSWERS;

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };

interface CheckDef { id: string; question: string }
interface ExampleDef { id: string; title: string; file: string; checks?: CheckDef[] }

const EXAMPLES: ExampleDef[] = [
  { id: "users", title: "A name that lies", file: "users.ts" },
  { id: "orders", title: "A comment that stopped being true", file: "orders.ts" },
  {
    id: "secrets", title: "A credential in the log", file: "secrets.ts",
    checks: [{ id: "no-secret-logging", question: "Does this function write a credential, token, or password to a log or console?" }],
  },
];

interface RecordedSuggestion { desc: string; fix: { text: string } }
interface RecordedMessage {
  line: number; column: number; endLine?: number; endColumn?: number;
  ruleId: string | null; severity: number; message: string; suggestions?: RecordedSuggestion[];
}
interface VariantResult { code: string; coldMs: number; warmMs: number; messages: RecordedMessage[] }

let model: string | undefined;

async function readModel(cacheDir: string): Promise<string | undefined> {
  try {
    const text = await readFile(join(cacheDir, "answers.jsonl"), "utf8");
    const firstLine = text.split("\n").find((l) => l.trim());
    if (!firstLine) return undefined;
    const parsed = JSON.parse(firstLine) as { model?: string };
    return parsed.model;
  } catch { return undefined; }
}

function toRecordedMessages(messages: ESLint.LintResult["messages"]): RecordedMessage[] {
  return messages.map((m) => ({
    line: m.line, column: m.column, endLine: m.endLine, endColumn: m.endColumn,
    ruleId: m.ruleId, severity: m.severity, message: m.message,
    ...(m.suggestions && m.suggestions.length
      ? { suggestions: m.suggestions.map((s) => ({ desc: s.desc, fix: { text: s.fix.text } })) }
      : {}),
  }));
}

async function lintVariant(example: ExampleDef, variant: "bad" | "fixed", tmpRoot: string): Promise<VariantResult> {
  const code = await readFile(join(root, "site", "examples", `${example.id}.${variant}.ts`), "utf8");
  const cacheDir = join(tmpRoot, `${example.id}-${variant}`);
  await rm(cacheDir, { recursive: true, force: true });

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      { settings: { jev: { cacheDir } } },
      { files: ["**/*.ts"], languageOptions: { parser: tsParser } },
      ...plugin.configs.recommended,
      ...(example.checks ? [{ rules: { "jev/check": ["warn", { checks: example.checks }] } }] : []),
    ],
  });

  const filePath = example.file;
  const t0 = performance.now();
  const [cold] = await eslint.lintText(code, { filePath });
  const t1 = performance.now();
  const [warm] = await eslint.lintText(code, { filePath });
  const t2 = performance.now();

  if (!model) model = await readModel(cacheDir);

  if (cold.messages.length !== warm.messages.length) {
    console.warn(`${example.id}/${variant}: cold (${cold.messages.length}) and warm (${warm.messages.length}) message counts differ`);
  }

  return { code, coldMs: Math.round(t1 - t0), warmMs: Math.round(t2 - t1), messages: toRecordedMessages(cold.messages) };
}

async function main(): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "eslint-plugin-jev-replay-"));
  const examples: unknown[] = [];
  try {
    for (const example of EXAMPLES) {
      const bad = await lintVariant(example, "bad", tmpRoot);
      const fixed = await lintVariant(example, "fixed", tmpRoot);
      console.log(
        `${example.id}: bad ${bad.messages.length} msg cold=${bad.coldMs}ms warm=${bad.warmMs}ms | ` +
        `fixed ${fixed.messages.length} msg cold=${fixed.coldMs}ms warm=${fixed.warmMs}ms`,
      );
      examples.push({
        id: example.id, title: example.title, file: example.file,
        ...(example.checks ? { checks: example.checks } : {}),
        variants: { bad, fixed },
      });
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }

  const replay = { recordedAt: new Date().toISOString(), model: model ?? "unknown", pluginVersion: pkg.version, examples };
  await writeFile(join(root, "site", "replay.json"), JSON.stringify(replay, null, 2) + "\n");
  console.log(`model: ${replay.model}`);
  console.log(`wrote site/replay.json`);
}

await main();
