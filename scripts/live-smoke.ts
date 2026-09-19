import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";

let plugin: typeof import("../dist/index.js").default;
try { plugin = (await import("../dist/index.js")).default; }
catch { console.error("dist/ not found. Run `pnpm build` first."); process.exit(1); }

const provider = process.env.JEV_PROVIDER === "openrouter" ? "openrouter" : "typesafe";
const requiredEnvVar = provider === "openrouter" ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY";
if (!process.env[requiredEnvVar]) { console.error(`Set ${requiredEnvVar} (JEV_PROVIDER=${provider})`); process.exit(1); }
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
