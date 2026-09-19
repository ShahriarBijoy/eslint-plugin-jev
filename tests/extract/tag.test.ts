import { tagLines, estimateTokens, untag } from "../../src/extract/tag.js";

describe("tagLines", () => {
  it("prefixes each line with a zero-padded tag starting at L001", () => {
    expect(tagLines("a\nb")).toBe("L001| a\nL002| b");
  });
  it("keeps blank lines so tags map to source lines", () => {
    expect(tagLines("a\n\nc")).toBe("L001| a\nL002| \nL003| c");
  });
  it("maps a tag back to a file line given the body start line", () => {
    expect(untag("L003", 40)).toBe(42);
    expect(untag("none", 40)).toBeUndefined();
  });
});

describe("estimateTokens", () => {
  it("uses four characters per token, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});
