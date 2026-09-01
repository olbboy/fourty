import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A failed GET /api/field-permissions/me used to become `{ ready: true }` with
 * empty hide/freeze sets — the form fail-opened every restricted field.
 */
describe("field access load", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/hooks/use-field-access.ts"), "utf8");

  it("does not fail open when /me is unreachable", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{\}/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("ready: false, failed: true");
  });
});
