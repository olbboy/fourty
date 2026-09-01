import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Contacts list and contact/company detail used to parse companies/pipelines
 * with `r.json()` and default to `[]`, so a 500 turned company names and deal
 * stages into "—". Lookups now throw on !ok and render LoadError.
 */
function src(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

describe("contact lookups load", () => {
  it("does not swallow a failed companies GET on the contacts list as blank names", () => {
    const list = src("src/app/(app)/contacts/contacts-client.tsx");
    expect(list).not.toMatch(/fetch\("\/api\/companies"\)\s*\.then\(\(r\) => r\.json\(\)\)/);
    expect(list).toContain("if (!r.ok) throw");
    expect(list).toContain("lookupsFailed");
    expect(list).toContain("LoadError");
    expect(list).toContain("compact");
  });

  it("does not swallow failed company/pipeline GETs on a contact", () => {
    const detail = src("src/app/(app)/contacts/[id]/contact-detail.tsx");
    expect(detail).not.toMatch(/fetch\("\/api\/companies"\)\s*\.then\(\(r\) => r\.json\(\)\)/);
    expect(detail).toContain("if (!co.ok || !p.ok) throw");
    expect(detail).toContain("lookupsFailed");
    expect(detail).toContain("compact");
  });

  it("does not swallow a failed pipelines GET on a company as blank deal stages", () => {
    const company = src("src/app/(app)/companies/[id]/company-detail.tsx");
    expect(company).not.toMatch(/fetch\("\/api\/pipelines"\)\s*\.then\(\(r\) => r\.json\(\)\)/);
    expect(company).toContain("if (!r.ok) throw");
    expect(company).toContain("lookupsFailed");
    expect(company).toContain("compact");
  });
});
