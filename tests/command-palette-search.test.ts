import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Record search from ⌘K used to ignore a failed GET (and keep stale hits, or
 * show nothing), which reads as "no matching records". Abort still stays quiet.
 */
describe("command palette search", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/components/command-palette.tsx"), "utf8");

  it("does not swallow a failed search GET as no results", () => {
    expect(src).toContain("/api/search");
    expect(src).toContain("if (!res.ok) throw");
    expect(src).toContain("setSearchFailed");
    expect(src).toContain("retry-search");
    expect(src).toContain("ctrl.signal.aborted");
  });

  it("routes custom-object hits to /objects/{apiName}/{id}", () => {
    expect(src).toContain("`/objects/${r.type}/`");
    expect(src).toContain("hrefFor");
  });
});
