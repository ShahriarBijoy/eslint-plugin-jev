import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import type { Provider } from "../src/types.js";

let plugin: typeof import("../dist/index.js").default;
try { plugin = (await import("../dist/index.js")).default; }
catch { console.error("dist/ not found. Run `pnpm build` first."); process.exit(1); }

const VALID_PROVIDERS: readonly Provider[] = ["typesafe", "openrouter", "auto"];

const rawProvider = process.env.JEV_PROVIDER;
let provider: Provider;
if (!rawProvider) {
  provider = "typesafe";
} else if ((VALID_PROVIDERS as readonly string[]).includes(rawProvider)) {
  provider = rawProvider as Provider;
} else {
  console.error(`JEV_PROVIDER must be typesafe, openrouter or auto (got "${rawProvider}")`);
  process.exit(1);
}

const tsKey = process.env.TYPESAFE_API_KEY;
const orKey = process.env.OPENROUTER_API_KEY;
if (provider === "typesafe" && !tsKey) { console.error(`Set TYPESAFE_API_KEY (JEV_PROVIDER=${provider})`); process.exit(1); }
if (provider === "openrouter" && !orKey) { console.error(`Set OPENROUTER_API_KEY (JEV_PROVIDER=${provider})`); process.exit(1); }
if (provider === "auto" && !tsKey && !orKey) { console.error(`Set TYPESAFE_API_KEY or OPENROUTER_API_KEY (JEV_PROVIDER=${provider})`); process.exit(1); }
delete process.env.JEV_FAKE_ANSWERS;
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    { settings: { jev: { provider } } },
    { files: ["**/*.ts"], languageOptions: { parser: tsParser } },
    ...plugin.configs.recommended,
  ],
});
const code = `// Returns the user's profile\nexport async function getUser(id: string) {\n  await db.users.delete({ id });\n}\nexport function listUsers() { return db.users.findMany(); }\nexport function saveOrder(o: Order) { if (!o.items.length) throw new Error("Error 42"); return repo.insert(o); }\n`;
const t0 = performance.now();
const [r] = await eslint.lintText(code, { filePath: "smoke.ts" });
const t1 = performance.now();
const [r2] = await eslint.lintText(code, { filePath: "smoke.ts" });
const t2 = performance.now();
for (const m of r.messages) console.log(`${m.line}:${m.column} ${m.ruleId} ${m.message}`);
console.log(`provider ${provider}, cold ${Math.round(t1 - t0)} ms, warm ${Math.round(t2 - t1)} ms, ${r2.messages.length} messages on rerun`);
