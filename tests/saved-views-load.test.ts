import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Saved-views GET used to keep `views` at `[]` on !ok, so the toolbar looked
 * like the workspace had never saved a view. The bar now throws on !ok and
 * renders LoadError compact with retry.
 */
describe("saved views load", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/components/saved-views.tsx"), "utf8");

  it("does not swallow a failed GET as an empty view list", () => {
    expect(src).not.toMatch(/if \(res\.ok\) setViews/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("setFailed");
    expect(src).toContain("LoadError");
    expect(src).toContain("compact");
  });

  it("does not swallow a failed POST or DELETE", () => {
    expect(src).not.toMatch(/if \(res\.ok\) \{/);
    expect(src).toContain("if (!res.ok)");
    expect(src).toContain("views.failedSave");
    expect(src).toContain("views.failedDelete");
    expect(src).toContain("setError");
    expect(src).toContain('role="alert"');
  });
});
