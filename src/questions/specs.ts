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

export function commentMatchesCodeQuestions(): Record<"main", Question> {
  return {
    main: {
      type: "noul",
      instructions: "Does `function.comment` describe behavior that `function.body` does not have, or leave out a side effect that `function.body` has?",
      criteria: {
        true: "The comment states a behavior, return value, or guarantee the code does not implement, or the code performs a write, network call, deletion, or mutation the comment does not mention. Examples: the comment says returns the profile and the body deletes; the comment says pure and the body writes a file.",
        false: "The comment is accurate for what the body does, or is merely brief, vague, or incomplete about minor details. Examples: the comment says saves an order and the body validates then saves.",
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
