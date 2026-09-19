import type { Rule } from "eslint";
import type { Answer, FunctionUnit, Question, Settings } from "../types.js";
import { acquireSession, releaseSession, type FileSession } from "../session/fileSession.js";

export interface JevRuleSpec<O> {
  name: string; description: string; type: "problem" | "suggestion"; hasSuggestions?: boolean;
  schema: unknown[]; defaultOptions: [O]; messages: Record<string, string>;
  select(unit: FunctionUnit, options: O, settings: Settings): boolean;
  questions(unit: FunctionUnit, options: O): Record<string, Question>;
  report(args: { context: Rule.RuleContext; unit: FunctionUnit; options: O; settings: Settings; answer: (qid: string) => Answer | undefined }): void;
}

export const pct = (p: number): string => p.toFixed(2);

let warnedOnce = false;

function reportFatal(context: Rule.RuleContext, session: FileSession | undefined, message: string): void {
  if (session?.settings.strict) {
    if (!session.fatalReported) {
      session.fatalReported = true;
      context.report({ loc: { line: 1, column: 0 }, messageId: "unavailable", data: { message } });
    }
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
      messages: { ...spec.messages, unavailable: "eslint-plugin-jev: {{message}}", skippedTooLarge: "eslint-plugin-jev: `{{name}}` skipped, about {{tokens}} tokens exceeds settings.jev.maxFunctionTokens." },
    },
    create(context) {
      const options = (context.options[0] ?? spec.defaultOptions[0]) as O;
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
          if (!session) return;
          try {
            if (programError) throw programError;
            const res = session.result();
            const fatal = res.errors.find((e) => !e.unitId);
            if (fatal) reportFatal(context, session, fatal.message);
            if (!session.skippedReported) {
              session.skippedReported = true;
              for (const s of session.skipped) context.report({ loc: s.loc, messageId: "skippedTooLarge", data: { name: s.name, tokens: String(s.estimatedTokens) } });
            }
            for (const unit of selected) {
              if (res.errors.some((e) => e.unitId === unit.id)) continue;
              spec.report({ context, unit, options, settings: session.settings, answer: (qid) => session!.answer(spec.name, unit.id, qid) });
            }
          } catch (err) {
            reportFatal(context, session, `rule ${spec.name} failed: ${(err as Error).message}`);
          } finally { releaseSession(context); }
        },
      };
    },
  };
}
