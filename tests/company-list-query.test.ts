import { describe, expect, it } from "vitest";
import {
  buildCompanyExportUrl,
  companyListQueryKey,
  parseCompanyListQuery,
  toCompanyApiParams,
} from "@/lib/company-list-query";

describe("company list query state", () => {
  it("parses URL state while keeping preview out of the list query", () => {
    const query = parseCompanyListQuery(
      new URLSearchParams("q= Acme &industry=SaaS&ownerId=u-1&sort=name_asc&offset=50&limit=50&preview=co-1"),
    );

    expect(query).toEqual({
      q: "Acme",
      industry: "SaaS",
      ownerId: "u-1",
      sort: "name_asc",
      offset: 50,
      limit: 50,
    });
    expect(companyListQueryKey(query)).not.toContain("preview");
  });

  it("uses the UI page size and omits the implicit default sort", () => {
    const query = parseCompanyListQuery(new URLSearchParams());
    expect(query).toEqual({ q: "", industry: "", ownerId: "", sort: null, offset: 0, limit: 50 });
    expect(toCompanyApiParams(query).toString()).toBe("limit=50");
    expect(parseCompanyListQuery(new URLSearchParams("limit=500")).limit).toBe(50);
  });

  it("serializes list filters for API requests", () => {
    const params = toCompanyApiParams({
      q: "Acme & Co",
      industry: "SaaS",
      ownerId: "none",
      sort: "annualRevenue_desc",
      offset: 50,
      limit: 50,
    });
    expect(params.get("q")).toBe("Acme & Co");
    expect(params.get("industry")).toBe("SaaS");
    expect(params.get("ownerId")).toBe("none");
    expect(params.get("sort")).toBe("annualRevenue_desc");
    expect(params.get("offset")).toBe("50");
    expect(params.get("limit")).toBe("50");
  });

  it("builds selected, filtered, and all export URLs", () => {
    const query = {
      q: "Acme",
      industry: "SaaS",
      ownerId: "",
      sort: "name_asc" as const,
      offset: 50,
      limit: 50,
    };

    expect(buildCompanyExportUrl("selected", query, ["id/1", "id 2"])).toBe(
      "/api/export/companies?scope=selected&ids=id%2F1%2Cid+2",
    );
    expect(buildCompanyExportUrl("filtered", query, [])).toBe(
      "/api/export/companies?scope=filtered&q=Acme&industry=SaaS&sort=name_asc",
    );
    expect(buildCompanyExportUrl("all", query, ["ignored"])).toBe("/api/export/companies?scope=all");
  });
});
