import type { AST } from "eslint";
export type Loc = AST.SourceLocation;

export interface ThrowSite { id: string; message: string; line: number; loc: Loc }

export interface FunctionUnit {
  id: string;                   // "f0", "f1", ... stable within a file
  name: string;                 // "getUser", "UserService.save", "default"
  kind: "declaration" | "expression" | "arrow" | "method";
  nameLoc: Loc;                 // where name-level diagnostics go
  commentLoc?: Loc;             // leading comment block, if any
  bodyStartLine: number;        // 1-based file line of the first tagged body line
  signature: string;            // "async function getUser(id: string): Promise<void>"
  comment?: string;             // leading comment text without delimiters
  body: string;                 // body with "L001| " tags, one per source line
  rawBody: string;
  throws: ThrowSite[];
  estimatedTokens: number;
}

export type NoulQuestion = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type Question = NoulQuestion | ChoiceQuestion;

export interface Answer { noul?: number; choice?: string; probabilities?: Record<string, number>; confidence?: number }
export type UnitAnswers = Record<string, Answer>;

export interface EvaluateUnit { id: string; name: string; state: Record<string, unknown>; stateText: string; questions: Record<string, Question>; estimatedTokens: number }
export interface EvaluateRequest { filename: string; cwd: string; model: string; timeoutMs: number; concurrency: number; cacheDir: string; maxFunctionTokens: number; units: EvaluateUnit[] }

export type ErrorKind = "no_key" | "transport" | "rate_limit" | "too_large" | "timeout" | "api" | "worker";
export interface EvaluateError { unitId?: string; kind: ErrorKind; message: string }
export interface EvaluateResponse { answers: Record<string, UnitAnswers>; model?: string; usage: { input_tokens: number; output_tokens: number }; cached: number; fetched: number; errors: EvaluateError[] }

export interface Settings { model: string; timeoutMs: number; maxFunctionTokens: number; concurrency: number; cacheDir: string; strict: boolean; ignoreNames: string[] }

/** The shape users write under `settings.jev` in their ESLint config; every field is optional. */
export type JevSettings = Partial<Settings>;
