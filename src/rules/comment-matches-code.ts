import { createJevRule, pct } from "./createJevRule.js";
import { commentMatchesCodeQuestions } from "../questions/specs.js";

interface Options { threshold: number }

export default createJevRule<Options>({
  name: "comment-matches-code", type: "problem",
  description: "Flag leading comments or JSDoc that describe behavior the function does not have.",
  schema: [{ type: "object", properties: { threshold: { type: "number", minimum: 0.5, maximum: 1 } }, additionalProperties: false }],
  defaultOptions: [{ threshold: 0.8 }],
  messages: { stale: "Comment on \"{{name}}\" describes behavior the code does not have (P={{p}}, threshold {{threshold}})." },
  select: (unit) => Boolean(unit.comment && unit.commentLoc),
  questions: () => commentMatchesCodeQuestions(),
  report({ context, unit, options, answer }) {
    const p = answer("main")?.noul;
    if (p === undefined || p < options.threshold) return;
    context.report({ loc: unit.commentLoc!, messageId: "stale", data: { name: unit.name, p: pct(p), threshold: pct(options.threshold) } });
  },
});
