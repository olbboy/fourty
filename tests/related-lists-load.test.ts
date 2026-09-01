import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Related-record GETs on contact/company detail used to keep the list at `[]`
 * on !ok, so a 500 looked like "no deals" / "no people". The cards now throw
 * on !ok and render LoadError compact with retry.
 */
function src(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

describe("related lists load", () => {
  it("does not swallow a failed deals GET on a contact as an empty pipeline", () => {
    const contact = src("src/app/(app)/contacts/[id]/contact-detail.tsx");
    expect(contact).not.toMatch(/if \(d\.ok\) setDeals/);
    expect(contact).toContain("if (!d.ok) throw");
    expect(contact).toContain("dealsFailed");
    expect(contact).toContain("LoadError");
    expect(contact).toContain("compact");
  });

  it("does not swallow failed people or deals GETs on a company as empty lists", () => {
    const company = src("src/app/(app)/companies/[id]/company-detail.tsx");
    expect(company).not.toMatch(/if \(c\.ok\) setContacts/);
    expect(company).not.toMatch(/if \(d\.ok\) setDeals/);
    expect(company).toContain("peopleFailed");
    expect(company).toContain("dealsFailed");
    expect(company).toContain("LoadError");
    expect(company).toContain("compact");
  });
});
