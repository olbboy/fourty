import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TOOLS } from "@/mcp/tools";

/**
 * The advertised MCP catalogue must stay identical across the three places a
 * caller actually reads it: the live TOOLS array (tools/list), the user-facing
 * docs, and public/llms.txt. A tool added in src/mcp/tools.ts used to ship
 * while those lists stayed stale.
 */

const ROOT = path.resolve(__dirname, "..");

/** snake_case (or single-word) identifiers in backticks — not camelCase like entityType. */
function snakeTicks(text: string): string[] {
  return [...text.matchAll(/`([a-z]+(?:_[a-z]+)*)`/g)].map((m) => m[1]);
}

function uniqueSorted(names: string[]): string[] {
  return [...new Set(names)].sort();
}

function fromMcpDoc(): string[] {
  const text = readFileSync(path.join(ROOT, "docs/api/mcp.md"), "utf8");
  const heading = text.match(/## Tools \((\d+)\)/);
  if (!heading) throw new Error("docs/api/mcp.md is missing a ## Tools (N) heading");
  const start = text.indexOf(heading[0]);
  const rest = text.slice(start);
  const next = rest.indexOf("\n## ", 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  const read = section.match(/\*\*Read:\*\*([\s\S]*?)\n>/);
  const write = section.match(/\*\*Write:\*\*([\s\S]*?)\n>/);
  if (!read || !write) throw new Error("docs/api/mcp.md is missing **Read:** / **Write:** lists");
  return [...snakeTicks(read[1]), ...snakeTicks(write[1])];
}

function fromLlmsTxt(): string[] {
  const text = readFileSync(path.join(ROOT, "public/llms.txt"), "utf8");
  const mcp = text.split("## MCP server")[1]?.split("\n## ")[0];
  if (!mcp) throw new Error("public/llms.txt is missing an MCP server section");
  const list = mcp.match(/Tools(?: \(\d+\))?:\s*([\s\S]*?)(?:Delete tools|Resources:)/);
  if (!list) throw new Error("public/llms.txt MCP section is missing a Tools: list");
  return snakeTicks(list[1]);
}

describe("MCP tool catalogue", () => {
  it("TOOLS, docs/api/mcp.md, and public/llms.txt advertise the same tools", () => {
    const live = TOOLS.map((t) => t.name);
    expect(new Set(live).size, "duplicate tool names in TOOLS").toBe(live.length);

    const documented = fromMcpDoc();
    const llms = fromLlmsTxt();
    expect(uniqueSorted(documented)).toEqual(uniqueSorted(live));
    expect(uniqueSorted(llms)).toEqual(uniqueSorted(live));
    expect(live).toHaveLength(documented.length);
  });

  it("product docs that say N tools match TOOLS.length", () => {
    const n = TOOLS.length;
    const files = [
      "README.md",
      "docs/api/mcp.md",
      "docs/getting-started/why-fourty.md",
      "docs/getting-started/key-features.md",
    ];
    for (const rel of files) {
      const text = readFileSync(path.join(ROOT, rel), "utf8");
      const hits = [...text.matchAll(/(\d+) tools/gi)];
      expect(hits.length, `${rel} should mention N tools`).toBeGreaterThan(0);
      for (const hit of hits) {
        expect(Number(hit[1]), `${rel} “${hit[0]}”`).toBe(n);
      }
    }
    const mcp = readFileSync(path.join(ROOT, "docs/api/mcp.md"), "utf8");
    expect(mcp).toMatch(new RegExp(`## Tools \\(${n}\\)`));
  });
});
