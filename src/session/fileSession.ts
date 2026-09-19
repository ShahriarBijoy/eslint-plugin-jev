import { createHash } from "node:crypto";
import type { Rule } from "eslint";
import type { Answer, EvaluateRequest, EvaluateResponse, FunctionUnit, Question, Settings } from "../types.js";
import { extractUnits, type ExtractResult } from "../extract/units.js";
import { unitState, stateText } from "../questions/build.js";
import { resolveSettings } from "../config/settings.js";
import { evaluateSync } from "../bridge/evaluateSync.js";

export class FileSession {
  readonly units: FunctionUnit[];
  readonly skipped: ExtractResult["skipped"];
  fatalReported = false;
  skippedReported = false;
  private questions = new Map<string, Record<string, Question>>();   // unitId -> `${ruleId}:${qid}` -> Question
  private memo: EvaluateResponse | undefined;
  constructor(private context: Rule.RuleContext, readonly settings: Settings) {
    const { units, skipped } = extractUnits(context.sourceCode, { maxFunctionTokens: settings.maxFunctionTokens });
    this.units = units; this.skipped = skipped;
  }
  register(ruleId: string, unitId: string, questions: Record<string, Question>): void {
    const bucket = this.questions.get(unitId) ?? {};
    for (const [qid, q] of Object.entries(questions)) bucket[`${ruleId}:${qid}`] = q;
    this.questions.set(unitId, bucket);
  }
  result(): EvaluateResponse {
    if (this.memo) return this.memo;
    const req: EvaluateRequest = {
      filename: this.context.filename, cwd: this.context.cwd, model: this.settings.model, timeoutMs: this.settings.timeoutMs,
      concurrency: this.settings.concurrency, cacheDir: this.settings.cacheDir, maxFunctionTokens: this.settings.maxFunctionTokens,
      units: this.units.filter((u) => this.questions.has(u.id)).map((u) => { const state = unitState(u); return { id: u.id, name: u.name, state, stateText: stateText(state), questions: this.questions.get(u.id)!, estimatedTokens: u.estimatedTokens }; }),
    };
    this.memo = req.units.length ? evaluateSync(req) : { answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors: [] };
    return this.memo;
  }
  answer(ruleId: string, unitId: string, qid: string): Answer | undefined {
    return this.result().answers[unitId]?.[`${ruleId}:${qid}`];
  }
}

const sessions = new Map<string, { session: FileSession; pending: number }>();

function keyFor(context: Rule.RuleContext): string {
  return context.filename + ":" + createHash("sha1").update(context.sourceCode.text).digest("hex");
}

/** Called from a rule's Program visitor. Returns the shared session and counts the caller as pending. */
export function acquireSession(context: Rule.RuleContext): FileSession {
  const key = keyFor(context);
  let entry = sessions.get(key);
  if (!entry) { entry = { session: new FileSession(context, resolveSettings((context.settings as { jev?: unknown })?.jev)), pending: 0 }; sessions.set(key, entry); }
  entry.pending++;
  return entry.session;
}

/** Called from Program:exit after the rule has reported. Frees the session when the last rule is done. */
export function releaseSession(context: Rule.RuleContext): void {
  const key = keyFor(context);
  const entry = sessions.get(key);
  if (!entry) return;
  if (--entry.pending <= 0) sessions.delete(key);
}
