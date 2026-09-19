import { readFileSync, readdirSync } from "node:fs";
for (const file of readdirSync("bench/results").filter((f) => f.endsWith(".json"))) {
  const { rows, usage, model } = JSON.parse(readFileSync(`bench/results/${file}`, "utf8")) as { model: string; usage: { input_tokens: number }; rows: Array<{ expected: boolean; p: number }> };
  console.log(`\n${file.replace(".json", "")}  model=${model}  cases=${rows.length}  cost=$${((usage.input_tokens / 1e6) * 0.042).toFixed(4)}`);
  console.log("threshold  precision  recall  flagged");
  for (const t of [0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
    const flagged = rows.filter((r) => r.p >= t);
    const tp = flagged.filter((r) => r.expected).length;
    const positives = rows.filter((r) => r.expected).length;
    console.log(`${t.toFixed(2).padEnd(10)} ${(flagged.length ? tp / flagged.length : 0).toFixed(2).padEnd(10)} ${(positives ? tp / positives : 0).toFixed(2).padEnd(7)} ${flagged.length}`);
  }
}
