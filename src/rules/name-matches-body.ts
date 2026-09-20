import { createJevRule, pct } from "./createJevRule.js";
import { nameMatchesBodyQuestions, VERB_OPTIONS } from "../questions/specs.js";

interface Options { threshold: number; suggestThreshold: number }

const VERB_TO_PREFIX: Record<(typeof VERB_OPTIONS)[number], string | null> = { get: "get", find: "find", create: "create", update: "update", delete: "delete", validate: "validate", parse: "parse", format: "format", send: "send", compute: "compute", handle: "handle", other: null };

export default createJevRule<Options>({
  name: "name-matches-body", type: "problem", hasSuggestions: true,
  description: "Flag functions whose name promises something different from what the body does.",
  schema: [{ type: "object", properties: { threshold: { type: "number", minimum: 0.5, maximum: 1 }, suggestThreshold: { type: "number", minimum: 0.5, maximum: 1 } }, additionalProperties: false }],
  defaultOptions: [{ threshold: 0.8, suggestThreshold: 0.7 }],
  messages: {
    mismatch: "Name says \"{{name}}\" but the body mostly does \"{{verb}}\" (P={{p}}, threshold {{threshold}}).",
    mismatchNoVerb: "Name \"{{name}}\" does not match what the body does (P={{p}}, threshold {{threshold}}).",
    rename: "Rename to `{{name}}`",
  },
  // `kind === "property"` is excluded for the same reason as the default `ignoreNames`: an
  // object-literal key is chosen by the interface that consumes the object, so it is not a promise
  // the author of the body made. Class methods are still judged.
  select: (unit, _o, settings) => unit.name !== "default" && unit.kind !== "property"
    && !settings.ignoreNames.some((re) => new RegExp(re).test(unit.name.split(".").pop()!)),
  questions: () => nameMatchesBodyQuestions(),
  report({ context, unit, options, answer }) {
    const main = answer("main")?.noul;
    if (main === undefined || main < options.threshold) return;
    const verb = answer("verb");
    const top = verb?.choice && (verb.probabilities?.[verb.choice] ?? 0) >= options.suggestThreshold ? verb.choice : undefined;
    const data = { name: unit.name, verb: top ?? "", p: pct(main), threshold: pct(options.threshold) };
    const shortName = unit.name.split(".").pop()!;
    const prefix = top ? VERB_TO_PREFIX[top as keyof typeof VERB_TO_PREFIX] : null;
    const suggested = prefix ? prefix + shortName.replace(/^[a-z]+/, "").replace(/^./, (c) => c.toUpperCase()) : null;
    const canSuggest = suggested !== null && suggested !== shortName && /^[A-Za-z_$][\w$]*$/.test(suggested);
    context.report({
      loc: unit.nameLoc, messageId: top ? "mismatch" : "mismatchNoVerb", data,
      suggest: canSuggest ? [{ messageId: "rename", data: { name: suggested! }, fix: (fixer) => fixer.replaceTextRange([context.sourceCode.getIndexFromLoc(unit.nameLoc.start), context.sourceCode.getIndexFromLoc(unit.nameLoc.end)], suggested!) }] : undefined,
    });
  },
});
