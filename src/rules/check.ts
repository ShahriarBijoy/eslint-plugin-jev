import { createJevRule, pct } from "./createJevRule.js";
import { checkQuestions, type CheckDef } from "../questions/specs.js";
import { untag } from "../extract/tag.js";

interface Options { checks: CheckDef[] }

export default createJevRule<Options>({
  name: "check", type: "suggestion",
  description: "Ask your own plain-English question about every function.",
  schema: [{
    type: "object",
    properties: { checks: { type: "array", items: { type: "object", required: ["id", "question"], properties: {
      id: { type: "string", pattern: "^[a-z0-9-]+$" }, question: { type: "string", minLength: 8 },
      criteria: { type: "object", required: ["true", "false"], properties: { true: { type: "string" }, false: { type: "string" } }, additionalProperties: false },
      locate: { type: "boolean" }, threshold: { type: "number", minimum: 0.5, maximum: 1 },
    }, additionalProperties: false } } },
    additionalProperties: false,
  }],
  defaultOptions: [{ checks: [] }],
  messages: { flagged: "[{{id}}] {{question}} Yes (P={{p}}, threshold {{threshold}})." },
  select: (_unit, options) => options.checks.length > 0,
  questions: (unit, options) => Object.assign({}, ...options.checks.map((c) => checkQuestions(c, unit))),
  report({ context, unit, options, answer }) {
    for (const c of options.checks) {
      const threshold = c.threshold ?? 0.8;
      const p = answer(c.id)?.noul;
      if (p === undefined || p < threshold) continue;
      const line = answer(`${c.id}:line`);
      const picked = line?.choice && (line.probabilities?.[line.choice] ?? 0) >= 0.6 ? untag(line.choice, unit.bodyStartLine) : undefined;
      const loc = picked ? { start: { line: picked, column: 0 }, end: { line: picked, column: context.sourceCode.lines[picked - 1]?.length ?? 0 } } : unit.nameLoc;
      context.report({ loc, messageId: "flagged", data: { id: c.id, question: c.question.trim(), p: pct(p), threshold: pct(threshold) } });
    }
  },
});
