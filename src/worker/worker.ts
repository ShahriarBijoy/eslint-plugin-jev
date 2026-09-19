import { runAsWorker } from "synckit";
import { evaluate } from "./evaluate.js";
import type { EvaluateRequest, EvaluateResponse } from "../types.js";

runAsWorker(async (req: EvaluateRequest): Promise<EvaluateResponse> => {
  try { return await evaluate(req); }
  catch (err) { return { answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, cached: 0, fetched: 0, errors: [{ kind: "worker", message: (err as Error).message }] }; }
});
