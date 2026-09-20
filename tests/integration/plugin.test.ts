import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import plugin from "../../src/index.js";

process.env.JEV_FAKE_ANSWERS = new URL("../fixtures/fake-answers-rules.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

describe("eslint-plugin-jev end to end", () => {
  it("lints a project with the recommended config and reports every rule", async () => {
    const cwd = new URL("../fixtures/project/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [
      { files: ["**/*.ts"], languageOptions: { parser: tsParser } },
      ...plugin.configs.recommended,
    ] });
    const [result] = await eslint.lintFiles(["src/users.ts"]);
    const ids = result.messages.map((m) => m.ruleId).sort();
    expect(ids).toEqual(["jev/comment-matches-code", "jev/helpful-error-message", "jev/name-matches-body"]);
    expect(result.messages.every((m) => m.severity === 1)).toBe(true);
    expect(result.messages.find((m) => m.ruleId === "jev/name-matches-body")?.message).toContain("P=0.94");
  });
  it("exposes all five rules", () => {
    expect(Object.keys(plugin.rules).sort()).toEqual(["check", "comment-matches-code", "helpful-error-message", "name-matches-body", "too-large"]);
  });
});
