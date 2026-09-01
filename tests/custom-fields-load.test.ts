import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Custom field defs used to treat a failed GET as "this object has no fields",
 * so a 500 hid the schema on every form and detail page. The hook now throws
 * on !ok and the inputs/display render LoadError.
 */
describe("custom field load", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/components/custom-fields.tsx"), "utf8");

  it("does not swallow a failed GET as an empty schema", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{ fields: \[\] \}/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("LoadError");
    expect(src).toContain("compact");
  });
});
