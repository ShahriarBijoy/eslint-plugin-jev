import { createJevRule, pct } from "./createJevRule.js";
import { helpfulErrorMessageQuestions } from "../questions/specs.js";

interface Options { threshold: number }

export default createJevRule<Options>({
  name: "helpful-error-message", type: "suggestion",
  description: "Flag thrown error messages that give the reader nothing to act on.",
  schema: [{ type: "object", properties: { threshold: { type: "number", minimum: 0.5, maximum: 1 } }, additionalProperties: false }],
  defaultOptions: [{ threshold: 0.85 }],
  messages: { unhelpful: "Error message \"{{message}}\" gives the reader nothing to act on (P={{p}}, threshold {{threshold}})." },
  select: (unit) => unit.throws.length > 0,
  questions: (unit) => helpfulErrorMessageQuestions(unit),
  report({ context, unit, options, answer }) {
    for (const t of unit.throws) {
      const p = answer(t.id)?.noul;
      if (p === undefined || p < options.threshold) continue;
      context.report({ loc: t.loc, messageId: "unhelpful", data: { message: t.message.length > 60 ? t.message.slice(0, 57) + "..." : t.message, p: pct(p), threshold: pct(options.threshold) } });
    }
  },
});
