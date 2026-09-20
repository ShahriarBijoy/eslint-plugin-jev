import type { Rule } from "eslint";
import type { Answer, FunctionUnit, Question, Settings } from "../types.js";
import { acquireSession, releaseSession, type FileSession } from "../session/fileSession.js";
import { resolveSettings } from "../config/settings.js";

export interface JevRuleSpec<O> {
  name: string; description: string; type: "problem" | "suggestion"; hasSuggestions?: boolean;
  schema: unknown[]; defaultOptions: [O]; messages: Record<string, string>;
  select(unit: FunctionUnit, options: O, settings: Settings): boolean;
  questions(unit: FunctionUnit, options: O): Record<string, Question>;
  report(args: { context: Rule.RuleContext; unit: FunctionUnit; options: O; settings: Settings; answer: (qid: string) => Answer | undefined }): void;
}

export const pct = (p: number): string => p.toFixed(2);

let warnedOnce = false;

/** The shared transport/API fatal (e.g. no_key). Gated per-session: reported once per file, regardless of how many jev rules see it. */
function reportTransportFatal(context: Rule.RuleContext, session: FileSession, message: string): void {
  if (session.settings.strict) {
    if (!session.fatalReported) {
      session.fatalReported = true;
      context.report({ loc: { line: 1, column: 0 }, messageId: "unavailable", data: { message } });
    }
  } else if (!warnedOnce) {
    warnedOnce = true;
    console.warn(message);
  }
}

/** A bug in this specific rule's own callbacks (select/questions/report) or in acquiring the session. Never gated by the
 * session's fatalReported flag: it is a distinct diagnostic from the transport fatal and must not be masked by it, nor mask it. */
function reportRuleFailure(context: Rule.RuleContext, strict: boolean, ruleName: string, err: unknown): void {
  const message = `rule ${ruleName} failed: ${(err as Error).message}`;
  if (strict) {
    context.report({ loc: { line: 1, column: 0 }, messageId: "unavailable", data: { message } });
  } else if (!warnedOnce) {
    warnedOnce = true;
    console.warn(message);
  }
}

export function createJevRule<O>(spec: JevRuleSpec<O>): Rule.RuleModule {
  return {
    meta: {
      type: spec.type,
      docs: { description: spec.description, url: `https://github.com/ShahriarBijoy/eslint-plugin-jev/blob/main/docs/rules/${spec.name}.md` },
      schema: spec.schema as Rule.RuleMetaData["schema"],
      defaultOptions: spec.defaultOptions,
      ...(spec.hasSuggestions ? { hasSuggestions: true } : {}),
      messages: { ...spec.messages, unavailable: "eslint-plugin-jev: {{message}}" },
    },
    create(context) {
      // meta.defaultOptions merging only exists from ESLint 9.15; the peer range allows 9.0, so
      // merge explicitly here instead of relying on the engine to do it.
      const options = { ...spec.defaultOptions[0], ...((context.options[0] as object | undefined) ?? {}) } as O;
      let session: FileSession | undefined;
      let selected: FunctionUnit[] = [];
      let programError: Error | undefined;
      return {
        Program() {
          try {
            session = acquireSession(context);
            selected = session.units.filter((u) => spec.select(u, options, session!.settings));
            for (const u of selected) session.register(spec.name, u.id, spec.questions(u, options));
          } catch (err) {
            selected = [];
            programError = err as Error;
          }
        },
        "Program:exit"() {
          if (!session) {
            // acquireSession itself threw in Program(): there is nothing to release, but the
            // failure must still surface rather than being swallowed by the `!session` guard.
            if (programError) {
              const settings = resolveSettings((context.settings as { jev?: unknown })?.jev);
              reportRuleFailure(context, settings.strict, spec.name, programError);
            }
            return;
          }
          try {
            if (programError) throw programError;
            const res = session.result();
            const fatal = res.errors.find((e) => !e.unitId);
            if (fatal) reportTransportFatal(context, session, fatal.message);
            // Oversized functions are reported by `jev/too-large`, which owns that message. Doing it
            // here meant the notice inherited the rule id of whichever jev rule ran first.
            for (const unit of selected) {
              if (res.errors.some((e) => e.unitId === unit.id)) continue;
              spec.report({ context, unit, options, settings: session.settings, answer: (qid) => session!.answer(spec.name, unit.id, qid) });
            }
          } catch (err) {
            reportRuleFailure(context, session.settings.strict, spec.name, err);
          } finally { releaseSession(context); }
        },
      };
    },
  };
}
