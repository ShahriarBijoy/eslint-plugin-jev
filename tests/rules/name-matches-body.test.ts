import { Linter, RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../src/rules/name-matches-body.js";
import { createJevRule } from "../../src/rules/createJevRule.js";

const fixturePath = new URL("../fixtures/fake-answers-rules.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
process.env.JEV_FAKE_ANSWERS = fixturePath;

const tester = new RuleTester({ languageOptions: { parser: tsParser } });

tester.run("name-matches-body", rule, {
  valid: [
    { code: "function listUsers() { return db.users.findMany(); }" },
    { code: "function maybeBad() { return 1; }" },                       // 0.7 below default threshold
    { code: "function useThing() { db.users.delete(); }" },              // ignored by default ignoreNames
    { code: "function maybeBad() { return 1; }", options: [{ threshold: 0.75 }] },
  ],
  invalid: [
    {
      code: "// Returns the user's profile\nasync function getUser(id: string) { await db.users.delete({ id }); }",
      errors: [{
        messageId: "mismatch", data: { name: "getUser", verb: "delete", p: "0.94", threshold: "0.80" }, line: 2, column: 16,
        suggestions: [{ messageId: "rename", data: { name: "deleteUser" }, output: "// Returns the user's profile\nasync function deleteUser(id: string) { await db.users.delete({ id }); }" }],
      }],
    },
    { code: "function maybeBad() { return 1; }", options: [{ threshold: 0.6 }], errors: [{ messageId: "mismatchNoVerb", data: { name: "maybeBad", p: "0.70", threshold: "0.60" } }] },
    {
      code: "function useThing() { db.users.delete(); }", settings: { jev: { ignoreNames: [] } },
      errors: [{
        messageId: "mismatch",
        suggestions: [{ messageId: "rename", data: { name: "deleteThing" }, output: "function deleteThing() { db.users.delete(); }" }],
      }],
    },
  ],
});

describe("strict mode", () => {
  beforeAll(() => {
    process.env.JEV_FAKE_ERRORS = JSON.stringify([{ kind: "no_key", message: "TYPESAFE_API_KEY not set" }]);
  });
  afterAll(() => {
    delete process.env.JEV_FAKE_ERRORS;
  });
  const strict = new RuleTester({ languageOptions: { parser: tsParser }, settings: { jev: { strict: true } } });
  strict.run("name-matches-body strict", rule, { valid: [], invalid: [{ code: "function listUsers() {}", errors: [{ messageId: "unavailable", line: 1, column: 1 }] }] });
});

const probeRule = createJevRule<Record<string, never>>({
  name: "probe", type: "problem", description: "probe rule for cross-rule session tests",
  schema: [{ type: "object", additionalProperties: true }], defaultOptions: [{}], messages: {},
  select: () => true,
  questions: () => ({ main: { type: "noul", instructions: "q" } }),
  report: () => {},
});

const throwingRule = createJevRule<Record<string, never>>({
  name: "throws", type: "problem", description: "rule whose report callback throws",
  schema: [{ type: "object", additionalProperties: true }], defaultOptions: [{}], messages: {},
  select: () => true,
  questions: () => ({ main: { type: "noul", instructions: "q" } }),
  report: () => { throw new Error("boom"); },
});

const selectThrowsRule = createJevRule<Record<string, never>>({
  name: "select-throws", type: "problem", description: "rule whose select callback throws",
  schema: [{ type: "object", additionalProperties: true }], defaultOptions: [{}], messages: {},
  select: () => { throw new Error("select-boom"); },
  questions: () => ({ main: { type: "noul", instructions: "q" } }),
  report: () => {},
});

describe("option defaults merge explicitly (ESLint 9.0-9.14 compatibility)", () => {
  it("threshold defaults to 0.8 when options are passed as {}", () => {
    const linter = new Linter();
    const messages = linter.verify(
      "function maybeBad() { return 1; }",
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tsParser },
        plugins: { jev: { rules: { "name-matches-body": rule } } },
        rules: { "jev/name-matches-body": ["warn", {}] },
      },
      "file.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("an explicit threshold overrides just that key, keeping other defaults", () => {
    const linter = new Linter();
    const messages = linter.verify(
      "function maybeBad() { return 1; }",
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tsParser },
        plugins: { jev: { rules: { "name-matches-body": rule } } },
        rules: { "jev/name-matches-body": ["warn", { threshold: 0.6 }] },
      },
      "file.ts",
    );
    const mismatchNoVerb = messages.filter((m) => m.messageId === "mismatchNoVerb");
    expect(mismatchNoVerb).toHaveLength(1);
  });
});

describe("session-level fatal/skipped reporting", () => {
  describe("shared fatal error", () => {
    beforeAll(() => {
      process.env.JEV_FAKE_ERRORS = JSON.stringify([{ kind: "no_key", message: "TYPESAFE_API_KEY not set" }]);
    });
    afterAll(() => {
      delete process.env.JEV_FAKE_ERRORS;
    });

    it("reports unavailable once per file even with two jev rules", () => {
      const linter = new Linter();
      const messages = linter.verify(
        "function listUsers() { return db.users.findMany(); }",
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser },
          plugins: { jev: { rules: { "name-matches-body": rule, probe: probeRule } } },
          settings: { jev: { strict: true } },
          rules: { "jev/name-matches-body": "error", "jev/probe": "error" },
        },
        "file.ts",
      );
      const unavailable = messages.filter((m) => m.messageId === "unavailable");
      expect(unavailable).toHaveLength(1);
    });
  });

  it("a throwing rule callback becomes an unavailable diagnostic in strict mode, not an exception", () => {
    const linter = new Linter();
    expect(() => {
      const messages = linter.verify(
        "function whatever() { return 1; }",
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser },
          plugins: { jev: { rules: { throws: throwingRule } } },
          settings: { jev: { strict: true } },
          rules: { "jev/throws": "error" },
        },
        "file.ts",
      );
      const unavailable = messages.filter((m) => m.messageId === "unavailable");
      expect(unavailable).toHaveLength(1);
      expect(unavailable[0].message).toContain("boom");
    }).not.toThrow();
  });

  describe("rule-local failures vs. the transport fatal", () => {
    beforeAll(() => {
      process.env.JEV_FAKE_ERRORS = JSON.stringify([{ kind: "no_key", message: "TYPESAFE_API_KEY not set" }]);
    });
    afterAll(() => {
      delete process.env.JEV_FAKE_ERRORS;
    });

    it("a rule-local failure does not mask the transport fatal for other rules", () => {
      const linter = new Linter();
      const messages = linter.verify(
        "function listUsers() { return db.users.findMany(); }",
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser },
          plugins: { jev: { rules: { throws: throwingRule, "name-matches-body": rule } } },
          settings: { jev: { strict: true } },
          rules: { "jev/throws": "error", "jev/name-matches-body": "error" },
        },
        "file.ts",
      );
      const unavailable = messages.filter((m) => m.messageId === "unavailable");
      expect(unavailable).toHaveLength(2);
      expect(unavailable.some((m) => m.message.includes("TYPESAFE_API_KEY"))).toBe(true);
      expect(unavailable.some((m) => m.message.includes("boom"))).toBe(true);
    });
  });

  it("a failing session construction is reported, not swallowed", () => {
    const linter = new Linter();
    expect(() => {
      const messages = linter.verify(
        "function whatever() { return 1; }",
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser },
          plugins: { jev: { rules: { "select-throws": selectThrowsRule } } },
          settings: { jev: { strict: true } },
          rules: { "jev/select-throws": "error" },
        },
        "file.ts",
      );
      const unavailable = messages.filter((m) => m.messageId === "unavailable");
      expect(unavailable).toHaveLength(1);
      expect(unavailable[0].message).toContain("select-boom");
    }).not.toThrow();
  });
});
