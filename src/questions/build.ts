import type { FunctionUnit } from "../types.js";

export function unitState(unit: FunctionUnit): Record<string, unknown> {
  const fn: Record<string, unknown> = { name: unit.name, signature: unit.signature };
  if (unit.comment) fn.comment = unit.comment;
  fn.body = unit.body;
  if (unit.throws.length) {
    fn.throws = Object.fromEntries(unit.throws.map((t) => [t.id, { message: t.message, line: `L${String(t.line - unit.bodyStartLine + 1).padStart(3, "0")}` }]));
  }
  return { function: fn };
}

export function stateText(state: Record<string, unknown>): string {
  return JSON.stringify(state);
}

export function lineOptions(unit: FunctionUnit): Record<string, string | null> {
  const n = unit.body.split("\n").length;
  const out: Record<string, string | null> = {};
  for (let i = 1; i <= n; i++) out[`L${String(i).padStart(3, "0")}`] = null;
  out.none = "No single line";
  return out;
}
