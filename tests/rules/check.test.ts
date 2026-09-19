import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../src/rules/check.js";
process.env.JEV_FAKE_ANSWERS = new URL("../fixtures/fake-answers-rules.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const tester = new RuleTester({ languageOptions: { parser: tsParser } });
const checks = [{ id: "no-secret-logging", question: "Does this function log a secret?" }];
tester.run("check", rule, {
  valid: [
    { code: "function clean() { console.log('ok'); }", options: [{ checks }] },
    { code: "function logsKey() { const k = key;\n  console.log(k); }" },   // no checks configured: nothing asked
  ],
  invalid: [
    { code: "function logsKey() {\n  const k = key;\n  console.log(k);\n}", options: [{ checks }],
      errors: [{ messageId: "flagged", data: { id: "no-secret-logging", question: "Does this function log a secret?", p: "0.97", threshold: "0.80" }, line: 3 }] },
    { code: "function logsKey() {\n  const k = key;\n  console.log(k);\n}", options: [{ checks: [{ ...checks[0], locate: false }] }],
      errors: [{ messageId: "flagged", line: 1, column: 10 }] },
    { code: "function logsKey() {\n  const k = key;\n  console.log(k);\n}",
      options: [{ checks: [checks[0], { id: "no-secret-logging", question: "A different question that is long?" }] }],
      errors: [{ messageId: "flagged", data: { id: "no-secret-logging", question: "Does this function log a secret?", p: "0.97", threshold: "0.80" }, line: 3 }] },
    { code: "function outOfRange() {\n  const k = key;\n}", options: [{ checks }],
      errors: [{ messageId: "flagged", line: 1, column: 10 }] },
  ],
});
