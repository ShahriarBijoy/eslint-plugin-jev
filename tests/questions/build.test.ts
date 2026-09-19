import { nameMatchesBodyQuestions, commentMatchesCodeQuestions, helpfulErrorMessageQuestions, checkQuestions, VERB_OPTIONS } from "../../src/questions/specs.js";
import { unitState, stateText, lineOptions } from "../../src/questions/build.js";
import type { FunctionUnit } from "../../src/types.js";

const unit: FunctionUnit = {
  id: "f0", name: "getUser", kind: "declaration",
  nameLoc: { start: { line: 2, column: 22 }, end: { line: 2, column: 29 } },
  commentLoc: { start: { line: 1, column: 0 }, end: { line: 1, column: 30 } },
  bodyStartLine: 3, signature: "async function getUser(id: string): Promise<void>",
  comment: "Returns the user's profile", body: "L001| await db.users.delete({ id });\nL002| throw new Error(\"Error 42\");",
  rawBody: "await db.users.delete({ id });\nthrow new Error(\"Error 42\");",
  throws: [{ id: "f0.t0", message: "Error 42", line: 4, loc: { start: { line: 4, column: 16 }, end: { line: 4, column: 26 } } }],
  estimatedTokens: 60,
};

describe("question specs", () => {
  it("name-matches-body has a bad=true noul and a verb choice with an other option", () => {
    const q = nameMatchesBodyQuestions();
    expect(q.main.type).toBe("noul");
    expect(q.main).toMatchSnapshot();
    expect(q.verb.type).toBe("choice");
    expect(Object.keys((q.verb as { criteria: object }).criteria)).toEqual([...VERB_OPTIONS]);
  });
  it("comment-matches-code snapshot", () => { expect(commentMatchesCodeQuestions()).toMatchSnapshot(); });
  it("helpful-error-message asks one noul per throw site keyed by site id", () => {
    const q = helpfulErrorMessageQuestions(unit);
    expect(Object.keys(q)).toEqual(["f0.t0"]);
    expect(q["f0.t0"]).toMatchSnapshot();
  });
  it("check appends the scoping suffix and adds a line choice by default", () => {
    const q = checkQuestions({ id: "no-secret-logging", question: "Does this function log a secret?" }, unit);
    expect(Object.keys(q)).toEqual(["no-secret-logging", "no-secret-logging:line"]);
    expect((q["no-secret-logging"] as { instructions: string }).instructions).toBe("Does this function log a secret? Judge only `function` in the state.");
    expect((q["no-secret-logging:line"] as { criteria: object }).criteria).toEqual({ L001: null, L002: null, none: "No single line" });
  });
  it("check without locate omits the line choice and passes criteria through", () => {
    const q = checkQuestions({ id: "x", question: "Q?", locate: false, criteria: { true: "bad", false: "fine" } }, unit);
    expect(Object.keys(q)).toEqual(["x"]);
    expect((q.x as { criteria: object }).criteria).toEqual({ true: "bad", false: "fine" });
  });
});

describe("state", () => {
  it("builds the function state with throws keyed by site id", () => {
    expect(unitState(unit)).toEqual({ function: { name: "getUser", signature: unit.signature, comment: unit.comment, body: unit.body, throws: { "f0.t0": { message: "Error 42", line: "L002" } } } });
    expect(stateText(unitState(unit))).toBe(JSON.stringify(unitState(unit)));
    expect(lineOptions(unit)).toEqual({ L001: null, L002: null, none: "No single line" });
  });
});
