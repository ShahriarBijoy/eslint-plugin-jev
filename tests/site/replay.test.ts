import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface RecordedSuggestion { desc: string; fix: { text: string } }
interface RecordedMessage {
  line: number; column: number; endLine?: number; endColumn?: number;
  ruleId: string | null; severity: number; message: string; suggestions?: RecordedSuggestion[];
}
interface VariantResult { code: string; coldMs: number; warmMs: number; messages: RecordedMessage[] }
interface ExampleEntry {
  id: string; title: string; file: string;
  checks?: { id: string; question: string }[];
  variants: { bad: VariantResult; fixed: VariantResult };
}
interface Replay { recordedAt: string; model: string; pluginVersion: string; examples: ExampleEntry[] }

const replayPath = fileURLToPath(new URL("../../site/replay.json", import.meta.url));
const replay = JSON.parse(readFileSync(replayPath, "utf8")) as Replay;

describe("site/replay.json", () => {
  it("was recorded on a valid date", () => {
    expect(Number.isNaN(new Date(replay.recordedAt).getTime())).toBe(false);
  });

  it("has a resolved jev model id", () => {
    expect(replay.model.startsWith("jev-")).toBe(true);
  });

  it("has exactly 3 examples, each with a bad and a fixed variant", () => {
    expect(replay.examples).toHaveLength(3);
    for (const example of replay.examples) {
      expect(example.variants.bad).toBeDefined();
      expect(example.variants.fixed).toBeDefined();
    }
  });

  it("flags the bad variant of every example", () => {
    for (const example of replay.examples) {
      expect(example.variants.bad.messages.length).toBeGreaterThan(0);
    }
  });

  it("keeps the fixed variant of every example clean", () => {
    for (const example of replay.examples) {
      expect(example.variants.fixed.messages).toHaveLength(0);
    }
  });

  it("gives every recorded message a line, a jev rule id, and a probability", () => {
    for (const example of replay.examples) {
      for (const variant of [example.variants.bad, example.variants.fixed]) {
        for (const message of variant.messages) {
          expect(typeof message.line).toBe("number");
          expect(message.ruleId).toBeTruthy();
          expect(message.ruleId?.startsWith("jev/")).toBe(true);
          expect(message.message).toContain("P=");
        }
      }
    }
  });
});
