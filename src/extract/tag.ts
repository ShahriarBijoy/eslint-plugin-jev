export function tagLines(text: string): string {
  return text.split("\n").map((line, i) => `L${String(i + 1).padStart(3, "0")}| ${line}`).join("\n");
}

/** "L003" with bodyStartLine 40 -> 42. Returns undefined for "none" or malformed tags. */
export function untag(tag: string, bodyStartLine: number): number | undefined {
  const m = /^L(\d{3,})$/.exec(tag);
  if (!m) return undefined;
  return bodyStartLine + Number(m[1]) - 1;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
