import type { FunctionUnit, Question } from "../types.js";
import { lineOptions } from "./build.js";

export const VERB_OPTIONS = ["get", "find", "create", "update", "delete", "validate", "parse", "format", "send", "compute", "handle", "other"] as const;

export function nameMatchesBodyQuestions(): Record<"main" | "verb", Question> {
  return {
    main: {
      type: "noul",
      instructions: "Does `function.name` promise a different action, object, or result than `function.body` performs?",
      criteria: {
        true: "The name describes an action or result the body does not perform, or the body's main effect is something the name hides. Examples: the name says get and the body deletes; the name says validate and the body saves; the name says fetchUser and the body returns orders.",
        false: "The name is a fair label for the body's main effect, even if it leaves out details such as helpers, logging, caching, or error handling. Examples: getUser that reads from a cache then the database; saveOrder that also validates before saving.",
      },
    },
    verb: {
      type: "choice",
      instructions: "Which verb best describes the main effect of `function.body`?",
      criteria: Object.fromEntries(VERB_OPTIONS.map((v) => [v, null])),
    },
  };
}

/** Two independent defects, so two questions.
 *
 * Asking "does the comment describe behavior the body does not have" made every delegating function
 * a true positive: a one-line body that calls a helper literally does not contain the behavior its
 * comment describes, and the model was right to say so. What a reader is harmed by is a comment that
 * MISLEADS, so `contradicts` asks about conflict rather than absence and states outright that work
 * done in a callee still counts as this function's behavior. `hides` is the other half — it was
 * previously folded into the same question, which meant a hidden-side-effect catch printed the
 * contradiction sentence and sent the reader looking for the wrong thing. */
export function commentMatchesCodeQuestions(): Record<"contradicts" | "hides", Question> {
  return {
    contradicts: {
      type: "noul",
      instructions: "Does `function.comment` state something about this function that `function.body` contradicts?",
      criteria: {
        true: "The comment states a behavior, return value, ordering, count, or guarantee, and the body does something different. This includes a comment that documents some other function rather than this one. Examples: the comment says returns the profile and the body deletes the user; the comment says newest first and the body sorts alphabetically; the comment says three options and the body offers two; the comment describes seeding a table and the body only checks whether the table is empty.",
        false: "The comment is accurate for this function once you credit work the body hands off: behavior inside a helper this body calls, a hook it invokes, or a constant it references counts as this function's behavior. A comment that is brief, vague, or silent about minor detail is accurate. Example: the comment describes scrolling and focusing while the body calls a scrollToElement helper that does both.",
      },
    },
    hides: {
      type: "noul",
      instructions: "Does `function.body` perform a write, network call, deletion, or other lasting side effect that `function.comment` does not mention at all?",
      criteria: {
        true: "The body changes state outside itself — writes to a database or a file, sends a request, deletes data, mutates an argument or a global — and the comment gives the reader no hint that it happens. Example: the comment describes resolving a caller's access level and the body also marks that account active in the database.",
        false: "The comment mentions the effect, or the body has no such effect, or the effect is one the comment's description already implies. Logging, metrics, caching, and memoization are not hidden side effects.",
      },
    },
  };
}

export function helpfulErrorMessageQuestions(unit: FunctionUnit): Record<string, Question> {
  const out: Record<string, Question> = {};
  for (const t of unit.throws) {
    out[t.id] = {
      type: "noul",
      instructions: `Would a developer reading the error message in \`function.throws.${t.id}.message\` in a log be unable to tell what went wrong or what to check next?`,
      criteria: {
        true: "The message is a bare code, a generic phrase such as something went wrong, failed, or invalid input, or names nothing the reader could act on. Examples: Error 42; Unexpected error; Invalid.",
        false: "The message names the failing thing, the bad value, the expected condition, or the next step. Examples: Expected a number but received string; Order has no items; Missing env var DATABASE_URL.",
      },
    };
  }
  return out;
}

export interface CheckDef { id: string; question: string; criteria?: { true: string; false: string }; locate?: boolean; threshold?: number }

export function checkQuestions(check: CheckDef, unit: FunctionUnit): Record<string, Question> {
  const out: Record<string, Question> = {
    [check.id]: { type: "noul", instructions: `${check.question.trim()} Judge only \`function\` in the state.`, ...(check.criteria ? { criteria: check.criteria } : {}) },
  };
  if (check.locate !== false) {
    out[`${check.id}:line`] = { type: "choice", instructions: `Which line of \`function.body\` most directly causes the issue asked about here: "${check.question.trim()}"? Pick none if no single line does.`, criteria: lineOptions(unit) };
  }
  return out;
}
