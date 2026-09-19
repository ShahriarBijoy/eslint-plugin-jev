import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../src/rules/helpful-error-message.js";
process.env.JEV_FAKE_ANSWERS = new URL("../fixtures/fake-answers-rules.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const tester = new RuleTester({ languageOptions: { parser: tsParser } });
tester.run("helpful-error-message", rule, {
  valid: [
    { code: "function clearThrow() { throw new Error(`Expected a number but received ${typeof x}`); }" },
    { code: "function saveOrder() { return 1; }" },                        // no throw: not asked
  ],
  invalid: [
    { code: "function saveOrder() {\n  throw new Error(\"Error 42\");\n}",
      errors: [{ messageId: "unhelpful", data: { message: "Error 42", p: "0.91", threshold: "0.85" }, line: 2, column: 19 }] },
    { code: "function twoThrows(x) {\n  if (!x) throw new Error(\"bad\");\n  throw new Error(`Expected a number but received ${typeof x}`);\n}",
      errors: [{ messageId: "unhelpful", data: { message: "bad", p: "0.95", threshold: "0.85" }, line: 2 }] },
  ],
});
