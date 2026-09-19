import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../src/rules/name-matches-body.js";

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
