import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ⌘K jump targets include custom objects. A failed GET used to become
 * `{ objects: [] }`, so the palette looked like a workspace with none defined.
 */
describe("command palette custom objects", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/components/command-palette.tsx"), "utf8");

  it("does not swallow a failed GET as an empty object list", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{ objects: \[\] \}/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("setObjectsFailed");
    expect(src).toContain("retry-custom-objects");
  });
});
