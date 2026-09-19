import { createRequire } from "node:module";
import type { ESLint, Linter } from "eslint";
import nameMatchesBody from "./rules/name-matches-body.js";
import commentMatchesCode from "./rules/comment-matches-code.js";
import helpfulErrorMessage from "./rules/helpful-error-message.js";
import check from "./rules/check.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const plugin = {
  meta: { name: "@shahriarbijoy/eslint-plugin-jev", version, namespace: "jev" },
  rules: { "name-matches-body": nameMatchesBody, "comment-matches-code": commentMatchesCode, "helpful-error-message": helpfulErrorMessage, check },
  configs: {} as { recommended: Linter.Config[] },
} satisfies ESLint.Plugin & { configs: { recommended: Linter.Config[] } };

Object.assign(plugin.configs, {
  recommended: [{
    name: "jev/recommended",
    plugins: { jev: plugin },
    rules: { "jev/name-matches-body": "warn", "jev/comment-matches-code": "warn", "jev/helpful-error-message": "warn" },
  }] satisfies Linter.Config[],
});

export default plugin;
export type { Settings, JevSettings, Provider } from "./types.js";
