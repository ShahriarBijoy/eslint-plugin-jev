import plugin from "../../src/index.js";

describe("jev.configs.recommended", () => {
  const configs = plugin.configs.recommended;

  it("turns on the four rules that cost nothing to leave on", () => {
    const rules = configs[0].rules!;
    expect(Object.keys(rules).sort()).toEqual([
      "jev/comment-matches-code", "jev/helpful-error-message", "jev/name-matches-body", "jev/too-large",
    ]);
  });

  it("leaves helpful-error-message off in test files", () => {
    // A throw inside a test is a guard for the test author, not a message anyone triages from a log.
    const override = configs.find((c) => c.rules?.["jev/helpful-error-message"] === "off");
    expect(override).toBeDefined();
    expect(override!.files).toEqual(expect.arrayContaining(["**/*.test.*", "**/*.spec.*"]));
  });

  it("keeps the judgment rules on in test files", () => {
    const override = configs.find((c) => c.rules?.["jev/helpful-error-message"] === "off")!;
    expect(override.rules!["jev/comment-matches-code"]).toBeUndefined();
    expect(override.rules!["jev/name-matches-body"]).toBeUndefined();
  });
});
