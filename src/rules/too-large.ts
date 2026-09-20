import type { Rule } from "eslint";
import { acquireSession, releaseSession, type FileSession } from "../session/fileSession.js";

/** Functions over `settings.jev.maxFunctionTokens` are never sent to the model, and that is worth
 * saying out loud — silence would read as "this function is fine". It gets its own rule id because
 * it is not a judgment: it used to be reported through whichever jev rule happened to run first, so
 * a 786-line component surfaced as a `name-matches-body` warning and padded that rule's count.
 *
 * Asks nothing, so it costs nothing: it never registers a question, which means the session never
 * makes a request on its behalf. */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Report functions too large to be judged, instead of silently skipping them.",
      url: "https://github.com/ShahriarBijoy/eslint-plugin-jev/blob/main/docs/rules/too-large.md",
    },
    schema: [],
    messages: { tooLarge: "eslint-plugin-jev: `{{name}}` skipped, about {{tokens}} tokens exceeds settings.jev.maxFunctionTokens." },
  },
  create(context) {
    let session: FileSession | undefined;
    return {
      Program() {
        try { session = acquireSession(context); } catch { session = undefined; }
      },
      "Program:exit"() {
        if (!session) return;
        try {
          if (session.skippedReported) return;
          session.skippedReported = true;
          for (const s of session.skipped) {
            context.report({ loc: s.loc, messageId: "tooLarge", data: { name: s.name, tokens: String(s.estimatedTokens) } });
          }
        } finally { releaseSession(context); }
      },
    };
  },
} satisfies Rule.RuleModule;
