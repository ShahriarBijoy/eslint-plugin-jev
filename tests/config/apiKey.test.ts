import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApiKey } from "../../src/config/apiKey.js";

function dirs() { const cwd = mkdtempSync(join(tmpdir(), "jevcwd-")); const home = mkdtempSync(join(tmpdir(), "jevhome-")); return { cwd, home }; }

describe("resolveApiKey", () => {
  it("prefers the environment variable", () => {
    const { cwd, home } = dirs();
    writeFileSync(join(cwd, ".env"), "TYPESAFE_API_KEY=fromfile\n");
    expect(resolveApiKey(cwd, { TYPESAFE_API_KEY: "fromenv" }, home)).toBe("fromenv");
  });
  it("falls back to .env in cwd, handling quotes and comments", () => {
    const { cwd, home } = dirs();
    writeFileSync(join(cwd, ".env"), "# keys\nOTHER=1\nTYPESAFE_API_KEY=\"quoted\"\n");
    expect(resolveApiKey(cwd, {}, home)).toBe("quoted");
  });
  it("falls back to ~/.config/jev/config.json", () => {
    const { cwd, home } = dirs();
    mkdirSync(join(home, ".config", "jev"), { recursive: true });
    writeFileSync(join(home, ".config", "jev", "config.json"), JSON.stringify({ apiKey: "global" }));
    expect(resolveApiKey(cwd, {}, home)).toBe("global");
  });
  it("returns undefined when nothing is set", () => {
    const { cwd, home } = dirs();
    expect(resolveApiKey(cwd, {}, home)).toBeUndefined();
  });
  it("handles CRLF line endings in .env with export prefix", () => {
    const { cwd, home } = dirs();
    writeFileSync(join(cwd, ".env"), "export TYPESAFE_API_KEY=crlf\r\n");
    expect(resolveApiKey(cwd, {}, home)).toBe("crlf");
  });
  it("strips an inline comment from an unquoted value", () => {
    const { cwd, home } = dirs();
    writeFileSync(join(cwd, ".env"), "TYPESAFE_API_KEY=abc # prod key\n");
    expect(resolveApiKey(cwd, {}, home)).toBe("abc");
  });
  it("keeps a hash inside a quoted value", () => {
    const { cwd, home } = dirs();
    writeFileSync(join(cwd, ".env"), 'TYPESAFE_API_KEY="a#b"\n');
    expect(resolveApiKey(cwd, {}, home)).toBe("a#b");
  });
});
