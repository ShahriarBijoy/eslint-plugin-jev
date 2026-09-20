import { readFileSync } from "node:fs";
import { Linter } from "eslint";
import type { SourceCode } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { extractUnits } from "../../src/extract/units.js";
import type { FunctionUnit } from "../../src/types.js";

function unitsOf(code: string, maxFunctionTokens = 6000) {
  let captured!: ReturnType<typeof extractUnits>;
  const linter = new Linter();
  linter.verify(code, {
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser },
    plugins: { probe: { rules: { capture: { create(ctx) { return { Program() { captured = extractUnits(ctx.sourceCode as unknown as SourceCode, { maxFunctionTokens }); } }; } } } } },
    rules: { "probe/capture": "error" },
  }, "file.ts");
  return captured;
}

const fixture = readFileSync(new URL("../fixtures/functions.ts", import.meta.url), "utf8");

describe("extractUnits", () => {
  const { units } = unitsOf(fixture);
  const byName = Object.fromEntries(units.map((u) => [u.name, u])) as Record<string, FunctionUnit>;

  it("finds declarations, named arrows, named expressions, default export and methods, not anonymous callbacks", () => {
    expect(units.map((u) => u.name)).toEqual(["getUser", "saveOrder", "parseDate", "default", "UserService.remove", "UserService.count", "noisy"]);
  });
  it("captures the leading comment without delimiters", () => {
    expect(byName.getUser.comment).toBe("Returns the user's profile");
    expect(byName.saveOrder.comment).toBe("Saves an order and returns its id.");
    expect(byName.parseDate.comment).toBeUndefined();
  });
  it("builds a signature from the source header", () => {
    expect(byName.getUser.signature).toBe("async function getUser(id: string): Promise<void>");
    expect(byName.saveOrder.signature).toBe("async (order: Order) =>");
  });
  it("tags body lines and records the body start line", () => {
    expect(byName.getUser.body).toBe("L001| await db.users.delete({ id });");
    expect(byName.getUser.bodyStartLine).toBe(3);
  });
  it("collects throw sites with static message text", () => {
    expect(byName.saveOrder.throws).toEqual([expect.objectContaining({ message: "Error 42", line: 8 })]);
    expect(byName.noisy.throws[0].message).toBe("Expected a number but received ${typeof x}");
  });
  it("gives stable ids and a token estimate", () => {
    expect(units.map((u) => u.id)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6"]);
    expect(byName.getUser.estimatedTokens).toBeGreaterThan(10);
  });
  it("skips functions over the token budget and reports them", () => {
    const { units: u, skipped } = unitsOf(fixture, 4);
    expect(u).toHaveLength(0);
    expect(skipped.map((s) => s.name)).toContain("getUser");
  });
});

describe("leading comment attachment", () => {
  it("does not attach a comment separated from the declaration by a blank line", () => {
    const { units } = unitsOf(`/** Module header explaining the file. */

function firstString(a: unknown) { return String(a); }`);
    expect(units[0].comment).toBeUndefined();
    expect(units[0].commentLoc).toBeUndefined();
  });

  it("attaches only the adjacent JSDoc when a module header also precedes it", () => {
    const { units } = unitsOf(`/** Module header. */

/** Coerces to a string. */
function coerceString(a: unknown) { return String(a); }`);
    expect(units[0].comment).toBe("Coerces to a string.");
    expect(units[0].commentLoc!.start.line).toBe(3);
  });

  it("keeps a contiguous run of line comments together", () => {
    const { units } = unitsOf(`// first line
// second line
function f() { return 1; }`);
    expect(units[0].comment).toBe("first line second line");
    expect(units[0].commentLoc!.start.line).toBe(1);
  });

  it("stops the line-comment run at a blank line", () => {
    const { units } = unitsOf(`// detached note

// attached note
function f() { return 1; }`);
    expect(units[0].comment).toBe("attached note");
    expect(units[0].commentLoc!.start.line).toBe(3);
  });
});

describe("object-literal property functions", () => {
  it("gives them kind property so name rules can skip interface-dictated names", () => {
    const { units } = unitsOf(`const crumb = { select: () => navigate("/tracker") };`);
    expect(units[0].name).toBe("select");
    expect(units[0].kind).toBe("property");
  });

  it("still treats class methods as methods", () => {
    const { units } = unitsOf(`class S { remove(id: string) { return db.delete(id); } }`);
    expect(units[0].kind).toBe("method");
  });
});
