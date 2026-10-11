import { describe, expect, it } from "vitest";
import {
  companyQueryPolicy,
  normalizeCompanyQuery,
  parseSelectedCompanyIds,
  type CompanyQuery,
} from "@/lib/company-query";
import type { FieldPolicy } from "@/lib/field-permissions";

function policy(...hidden: string[]): FieldPolicy {
  return {
    rules: new Map(hidden.map((field) => [`companies.${field}`, { read: false, write: false }])),
  };
}

function query(raw = ""): CompanyQuery {
  const result = normalizeCompanyQuery(new URLSearchParams(raw));
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("company query contract", () => {
  it("normalizes legacy defaults and the Phase 2 sort/page allowlist", () => {
    expect(query()).toEqual({
      q: undefined,
      industry: undefined,
      sort: "updatedAt_desc",
      sortProvided: false,
      offset: 0,
      limit: 200,
    });
    expect(
      query("q= Acme &industry=SaaS&sort=name_asc&offset=50&limit=50"),
    ).toEqual({
      q: "Acme",
      industry: "SaaS",
      sort: "name_asc",
      sortProvided: true,
      offset: 50,
      limit: 50,
    });
  });

  it.each([
    ["offset=-1", "offset"],
    ["offset=1.5", "offset"],
    ["limit=0", "limit"],
    ["sort=score", "sort"],
  ])("rejects invalid %s", (query, field) => {
    const result = normalizeCompanyQuery(new URLSearchParams(query));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe(field);
  });

  it("clamps an oversized legacy limit to 500", () => {
    expect(query("limit=999").limit).toBe(500);
  });

  it("allows q only across readable fields and refuses a hidden industry filter", () => {
    const result = companyQueryPolicy(
      query("q=Acme&industry=SaaS&sort=name_asc"),
      policy("industry"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);

    const qOnly = companyQueryPolicy(
      query("q=Acme"),
      policy("industry"),
    );
    expect(qOnly.ok).toBe(true);
    if (qOnly.ok) expect(qOnly.searchFields).toEqual(["name", "domain"]);
  });

  it("fails closed when every q field is hidden", () => {
    const result = companyQueryPolicy(
      query("q=secret"),
      policy("name", "domain", "industry"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects explicit hidden sorts but falls back for the implicit updatedAt sort", () => {
    const explicit = companyQueryPolicy(
      query("sort=annualRevenue_desc"),
      policy("annualRevenue"),
    );
    expect(explicit.ok).toBe(false);
    if (!explicit.ok) expect(explicit.status).toBe(403);

    const implicit = companyQueryPolicy(
      query(),
      policy("updatedAt"),
    );
    expect(implicit.ok).toBe(true);
    if (implicit.ok) expect(implicit.effectiveSort).toBe("id_asc");
  });

  it("deduplicates selected ids and enforces the 500-id cap", () => {
    expect(parseSelectedCompanyIds(new URLSearchParams("ids=a,b&id=c&ids=b"))).toEqual(["a", "b", "c"]);
    expect(parseSelectedCompanyIds(new URLSearchParams("ids="))).toEqual([]);

    const tooMany = new URLSearchParams();
    tooMany.set("ids", Array.from({ length: 501 }, (_, i) => `id-${i}`).join(","));
    expect(() => parseSelectedCompanyIds(tooMany)).toThrow(/500/);
  });
});
