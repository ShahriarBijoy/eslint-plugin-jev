import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import tooLarge from "../../src/rules/too-large.js";
import nameMatchesBody from "../../src/rules/name-matches-body.js";

process.env.JEV_FAKE_ANSWERS = new URL("../fixtures/fake-answers-rules.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const oversized = "function listUsers() { return db.users.findMany(); }";

function lint(rules: Linter.RulesRecord, plugins: Record<string, unknown>) {
  return new Linter().verify(oversized, {
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser },
    plugins: { jev: { rules: plugins } } as never,
    settings: { jev: { maxFunctionTokens: 4 } },   // forces the function over budget
    rules,
  }, "file.ts");
}

describe("jev/too-large", () => {
  it("reports an oversized function under its own rule id", () => {
    const messages = lint({ "jev/too-large": "warn" }, { "too-large": tooLarge });
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("jev/too-large");
    expect(messages[0].message).toContain("listUsers");
  });

  it("does not pad another rule's findings with the skip notice", () => {
    const messages = lint({ "jev/name-matches-body": "warn" }, { "name-matches-body": nameMatchesBody });
    expect(messages.filter((m) => m.message.includes("exceeds"))).toHaveLength(0);
  });

  it("reports the skip once when both rules are on", () => {
    const messages = lint(
      { "jev/too-large": "warn", "jev/name-matches-body": "warn" },
      { "too-large": tooLarge, "name-matches-body": nameMatchesBody },
    );
    expect(messages.filter((m) => m.message.includes("exceeds"))).toHaveLength(1);
  });
});
