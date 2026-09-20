import { createJevRule, pct } from "./createJevRule.js";
import { commentMatchesCodeQuestions } from "../questions/specs.js";

interface Options { threshold: number }

const SKIP_COMMENT = /^(eslint[- ]|@ts-|global\b|globals\b|exported\b|prettier-|istanbul\b|c8\b|v8\b|copyright\b|license\b|licence\b|spdx-)/i;

export default createJevRule<Options>({
  name: "comment-matches-code", type: "problem",
  description: "Flag leading comments or JSDoc that mislead about what the function does.",
  schema: [{ type: "object", properties: { threshold: { type: "number", minimum: 0.5, maximum: 1 } }, additionalProperties: false }],
  defaultOptions: [{ threshold: 0.8 }],
  messages: {
    contradicts: "Comment on \"{{name}}\" contradicts what the code does (P={{p}}, threshold {{threshold}}).",
    hides: "Comment on \"{{name}}\" does not mention a side effect the code has (P={{p}}, threshold {{threshold}}).",
  },
  select: (unit) => Boolean(unit.comment && unit.commentLoc && !SKIP_COMMENT.test(unit.comment.trim())),
  questions: () => commentMatchesCodeQuestions(),
  report({ context, unit, options, answer }) {
    // One diagnostic per comment: when both hold, report whichever the model is surer of, so the
    // sentence the reader gets names the defect that is actually there.
    const scored = ([["contradicts", answer("contradicts")?.noul], ["hides", answer("hides")?.noul]] as const)
      .filter((e): e is readonly [typeof e[0], number] => e[1] !== undefined && e[1] >= options.threshold)
      .sort((a, b) => b[1] - a[1]);
    const top = scored[0];
    if (!top) return;
    context.report({ loc: unit.commentLoc!, messageId: top[0], data: { name: unit.name, p: pct(top[1]), threshold: pct(options.threshold) } });
  },
});
