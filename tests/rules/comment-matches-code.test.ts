import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../src/rules/comment-matches-code.js";
process.env.JEV_FAKE_ANSWERS = new URL("../fixtures/fake-answers-rules.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const tester = new RuleTester({ languageOptions: { parser: tsParser } });
tester.run("comment-matches-code", rule, {
  valid: [
    { code: "/** Saves an order. */\nfunction goodComment() { repo.insert(); }" },
    { code: "function staleComment() { db.delete(); }" },                 // no comment: not asked
    { code: "// eslint-disable-next-line no-console\nfunction staleComment() { db.delete(); }" },
    { code: "/* Copyright 2026 Someone. MIT License. */\nfunction staleComment() { db.delete(); }" },
  ],
  invalid: [
    { code: "// Returns the cached profile\nfunction staleComment() { db.delete(); }",
      errors: [{ messageId: "stale", data: { name: "staleComment", p: "0.88", threshold: "0.80" }, line: 1, column: 1 }] },
  ],
});
