import { createRequire } from "node:module";
import type { ESLint, Linter, Rule } from "eslint";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const plugin = {
  meta: { name: "eslint-plugin-jev", version, namespace: "jev" },
  rules: {} as Record<string, Rule.RuleModule>,
  configs: {} as { recommended: Linter.Config[] },
} satisfies ESLint.Plugin & { configs: { recommended: Linter.Config[] } };

Object.assign(plugin.configs, { recommended: [] as Linter.Config[] });

export default plugin;
