import { createRequire } from "node:module";
import type { ESLint, Linter } from "eslint";
import nameMatchesBody from "./rules/name-matches-body.js";
import commentMatchesCode from "./rules/comment-matches-code.js";
import helpfulErrorMessage from "./rules/helpful-error-message.js";
import check from "./rules/check.js";
import tooLarge from "./rules/too-large.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const plugin = {
  meta: { name: "@shahriarbijoy/eslint-plugin-jev", version, namespace: "jev" },
  rules: { "name-matches-body": nameMatchesBody, "comment-matches-code": commentMatchesCode, "helpful-error-message": helpfulErrorMessage, check, "too-large": tooLarge },
  configs: {} as { recommended: Linter.Config[] },
} satisfies ESLint.Plugin & { configs: { recommended: Linter.Config[] } };

const TEST_FILES = ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/__mocks__/**"];

Object.assign(plugin.configs, {
  recommended: [
    {
      name: "jev/recommended",
      plugins: { jev: plugin },
      rules: { "jev/name-matches-body": "warn", "jev/comment-matches-code": "warn", "jev/helpful-error-message": "warn", "jev/too-large": "warn" },
    },
    {
      // A throw inside a test is a guard for whoever is reading the failure right then, with the
      // assertion and the case name already on screen. "create failed" is a fine message there and a
      // bad one in production, and the rule cannot tell the difference — so scope decides instead.
      // The judgment rules stay on: a test helper whose name lies is still worth knowing about.
      name: "jev/recommended-tests",
      files: TEST_FILES,
      rules: { "jev/helpful-error-message": "off" },
    },
  ] satisfies Linter.Config[],
});

export default plugin;
export type { Settings, JevSettings, Provider } from "./types.js";
