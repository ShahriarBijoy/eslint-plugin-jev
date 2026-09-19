import { createJevRule, pct } from "./createJevRule.js";
import { commentMatchesCodeQuestions } from "../questions/specs.js";

interface Options { threshold: number }

const SKIP_COMMENT = /^(eslint[- ]|@ts-|global\b|globals\b|exported\b|prettier-|istanbul\b|c8\b|v8\b|copyright\b|license\b|licence\b|spdx-)/i;

export default createJevRule<Options>({
  name: "comment-matches-code", type: "problem",
  description: "Flag leading comments or JSDoc that describe behavior the function does not have.",
  schema: [{ type: "object", properties: { threshold: { type: "number", minimum: 0.5, maximum: 1 } }, additionalProperties: false }],
  defaultOptions: [{ threshold: 0.8 }],
  messages: { stale: "Comment on \"{{name}}\" describes behavior the code does not have (P={{p}}, threshold {{threshold}})." },
  select: (unit) => Boolean(unit.comment && unit.commentLoc && !SKIP_COMMENT.test(unit.comment.trim())),
  questions: () => commentMatchesCodeQuestions(),
  report({ context, unit, options, answer }) {
    const p = answer("main")?.noul;
    if (p === undefined || p < options.threshold) return;
    context.report({ loc: unit.commentLoc!, messageId: "stale", data: { name: unit.name, p: pct(p), threshold: pct(options.threshold) } });
  },
});
