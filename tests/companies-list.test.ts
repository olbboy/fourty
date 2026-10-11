import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";

describe("Companies list query (real Postgres and RLS)", () => {
  const tokens = { admin: "frty_company_list_admin", viewer: "frty_company_list_viewer", other: "frty_company_list_other" };
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let routes: typeof import("@/app/api/companies/route");
  let detail: typeof import("@/app/api/companies/[id]/route");
  let policy: typeof import("@/app/api/field-permissions/route");
  let workspace: string;
  let otherId: string;

  const request = (query = "", token = tokens.admin) => new Request(`http://localhost/api/companies${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const list = async (query = "", token = tokens.admin) => {
    const response = await routes.GET(request(query, token));
    expect(response.status).toBe(200);
    return response.json();
  };
  async function hide(...fields: string[]) {
    for (const field of fields) {
      const response = await policy.POST(new Request("http://localhost/api/field-permissions", {
        method: "POST", headers: { authorization: `Bearer ${tokens.admin}`, "content-type": "application/json" },
        body: JSON.stringify({ object: "companies", field, role: "viewer", canRead: false, canWrite: false }),
      }));
      expect(response.status).toBe(200);
    }
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    routes = await import("@/app/api/companies/route");
    detail = await import("@/app/api/companies/[id]/route");
    policy = await import("@/app/api/field-permissions/route");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    workspace = await createWorkspace();
    const other = await createWorkspace();
    for (const [role, token] of Object.entries(tokens)) {
      await db.insert(tables.apiKeys).values({ id: newId(), workspaceId: role === "other" ? other : workspace,
        name: role, role: role === "viewer" ? "viewer" : "admin", prefix: token.slice(0, 8), keyHash: sha256(token), createdAt: Date.now() });
    }
    await withWorkspace(workspace, () => db.insert(tables.companies).values(Array.from({ length: 215 }, (_, i) => ({
      id: `company-${String(i).padStart(3, "0")}`, name: `Company ${String(i).padStart(3, "0")}`,
      domain: `private-${i}.example`, industry: i % 2 ? "Software" : "Retail", annualRevenue: i,
      createdAt: 1000, updatedAt: 2000,
    }))));
    otherId = newId();
    await withWorkspace(other, () => db.insert(tables.companies).values({
      id: otherId, name: "Company tenant B", industry: "Private B", createdAt: 1000, updatedAt: 2000,
    }));
  });

  beforeEach(async () => {
    await withWorkspace(workspace, () => db.delete(tables.fieldPermissions).where(eq(tables.fieldPermissions.object, "companies")));
  });

  it("preserves the wrapper/default cap and returns accurate tenant-scoped metadata", async () => {
    const data = await list();
    expect(data.companies).toHaveLength(200);
    expect(data.page).toEqual({ offset: 0, limit: 200, total: 215, hasMore: true });
    expect(data.facets.industries).toEqual(["Retail", "Software"]);
    expect((await list("?limit=999")).page.limit).toBe(500);
  });

  it("uses deterministic pages, returns total on an empty page and supports server filters", async () => {
    const first = await list("?limit=50&sort=name_asc");
    const second = await list("?limit=50&offset=50&sort=name_asc");
    expect(first.companies[0].name).toBe("Company 000");
    expect(second.companies[0].name).toBe("Company 050");
    expect(new Set([...first.companies, ...second.companies].map((row) => row.id)).size).toBe(100);
    const empty = await list("?offset=999&limit=50");
    expect(empty.companies).toEqual([]);
    expect(empty.page).toEqual({ offset: 999, limit: 50, total: 215, hasMore: false });
    const filtered = await list("?q=Company%200&industry=Software&sort=annualRevenue_desc");
    expect(filtered.page.total).toBe(50);
    expect(filtered.companies[0].annualRevenue).toBe(99);
    expect(filtered.facets.industries).toEqual(["Retail", "Software"]);
  });

  it("rejects malformed pagination and sorts without querying unbounded data", async () => {
    for (const query of ["?offset=-1", "?offset=1.5", "?limit=0", "?limit=nope", "?sort=ownerId_asc"]) {
      expect((await routes.GET(request(query))).status).toBe(400);
    }
  });

  it("excludes hidden fields from predicates, sorting, facets and records", async () => {
    await hide("industry", "annualRevenue", "domain");
    const data = await list("?q=Company%20000", tokens.viewer);
    expect(data.page.total).toBe(1);
    expect(data.companies[0]).not.toHaveProperty("domain");
    expect(data.companies[0]).not.toHaveProperty("annualRevenue");
    expect(data.facets).toBeUndefined();
    expect((await list("?q=private-0", tokens.viewer)).page.total).toBe(0);
    expect((await routes.GET(request("?industry=Software", tokens.viewer))).status).toBe(403);
    expect((await routes.GET(request("?sort=annualRevenue_desc", tokens.viewer))).status).toBe(403);
    await hide("name");
    expect((await routes.GET(request("?q=Company", tokens.viewer))).status).toBe(403);
  });

  it("supports policy-redacted structural fields without restoring them", async () => {
    await hide("id", "name", "updatedAt");
    const data = await list("?limit=1", tokens.viewer);
    expect(data.companies).toHaveLength(1);
    for (const field of ["id", "name", "updatedAt"]) expect(data.companies[0]).not.toHaveProperty(field);
    expect((await routes.GET(request("?sort=updatedAt_desc", tokens.viewer))).status).toBe(403);
    expect((await list("?limit=1&sort=annualRevenue_asc")).companies[0].annualRevenue).toBe(0);
  });

  it("keeps rows and total consistent while another transaction inserts", async () => {
    for (let i = 0; i < 3; i++) {
      const [data] = await Promise.all([
        list("?limit=500"),
        withWorkspace(workspace, () => db.insert(tables.companies).values({ id: `concurrent-${i}`, name: `Concurrent ${i}`, createdAt: 1000, updatedAt: 2000 })),
      ]);
      expect(data.page.total).toBe(data.companies.length);
    }
  });

  it("keeps preview reads tenant-scoped and hides structural fields", async () => {
    expect((await detail.GET(request(), { params: Promise.resolve({ id: otherId }) })).status).toBe(404);
    await hide("id", "name", "updatedAt");
    const response = await detail.GET(request("", tokens.viewer), { params: Promise.resolve({ id: "company-000" }) });
    expect(response.status).toBe(200);
    const { company } = await response.json();
    for (const field of ["id", "name", "updatedAt"]) expect(company).not.toHaveProperty(field);
  });
});
