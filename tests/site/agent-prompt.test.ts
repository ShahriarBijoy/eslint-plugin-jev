import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function resolve(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

/** Extracts the text inside the first fenced code block (```...```) of a Markdown file. */
function extractFencedBlock(markdown: string): string {
  const match = markdown.match(/```\n([\s\S]*?)\n```/);
  if (!match) throw new Error("no fenced code block found");
  return match[1];
}

/** Extracts and HTML-entity-decodes the contents of the #snip-agent <pre><code> block. */
function extractSnipAgent(html: string): string {
  const match = html.match(/<pre><code id="snip-agent">([\s\S]*?)<\/code><\/pre>/);
  if (!match) throw new Error("no #snip-agent block found");
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("agent setup prompt stays in sync", () => {
  const docsAgentSetup = extractFencedBlock(
    readFileSync(resolve("../../docs/agent-setup.md"), "utf8"),
  );
  const siteAgentSetup = extractFencedBlock(
    readFileSync(resolve("../../site/agent-setup.md"), "utf8"),
  );
  const readme = readFileSync(resolve("../../README.md"), "utf8");
  const readmeAgentSetup = extractFencedBlock(
    readme.slice(readme.indexOf("## Set up with an AI agent")),
  );
  const siteIndex = extractSnipAgent(
    readFileSync(resolve("../../site/index.html"), "utf8"),
  );

  it("is under 40 lines", () => {
    expect(docsAgentSetup.split("\n").length).toBeLessThan(40);
  });

  it("is byte-identical across docs/agent-setup.md, site/agent-setup.md, README.md, and site/index.html", () => {
    expect(siteAgentSetup).toBe(docsAgentSetup);
    expect(readmeAgentSetup).toBe(docsAgentSetup);
    expect(siteIndex).toBe(docsAgentSetup);
  });
});
