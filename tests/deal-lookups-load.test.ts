import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Deal detail used to parse pipelines/companies/contacts with `r.json()` and
 * default to `[]` on any body, so a 500 hid the stage stepper and turned the
 * company/contact links into "—". Lookups now throw on !ok and render LoadError.
 */
function src(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

describe("deal lookups load", () => {
  it("does not swallow failed lookup GETs as empty stage/company/contact", () => {
    const detail = src("src/app/(app)/deals/[id]/deal-detail.tsx");
    expect(detail).not.toMatch(/fetch\("\/api\/pipelines"\)\.then\(\(r\) => r\.json\(\)\)/);
    expect(detail).toContain('if (!p.ok || !co.ok || !ct.ok) throw');
    expect(detail).toContain("lookupsFailed");
    expect(detail).toContain("LoadError");
    expect(detail).toContain("compact");
  });

  it("does not hang the kanban on a failed pipelines GET", () => {
    const list = src("src/app/(app)/deals/deals-client.tsx");
    expect(list).not.toMatch(/fetch\("\/api\/pipelines"\)\s*\.then\(\(r\) => r\.json\(\)\)/);
    expect(list).toContain('if (!p.ok || !co.ok || !ct.ok) throw');
    expect(list).toContain("lookupsFailed");
    expect(list).toContain("LoadError");
  });
});
