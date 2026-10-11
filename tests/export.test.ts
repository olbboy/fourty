import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/csv";
import { resetDb, createWorkspace } from "./pg-setup";

describe("CSV export authorization, scope, and field policy", () => {
  const KEY = {
    admin: "frty_export_admin",
    member: "frty_export_member",
    viewer: "frty_export_viewer",
  };
  const KEY_B = "frty_export_workspace_b";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let exportRoutes: typeof import("@/app/api/export/[entity]/route");
  let fieldPermissionRoutes: typeof import("@/app/api/field-permissions/route");
  let wsA: string;
  let wsB: string;

  const req = (token: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...init,
    });

  async function csvResponse(response: Response): Promise<{ bytes: Uint8Array; text: string }> {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, text: Buffer.from(bytes).toString("utf8") };
  }

  async function seedKey(workspaceId: string, token: string, role: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId,
      name: role,
      prefix: token.slice(0, 8),
      keyHash: sha256(token),
      role,
      createdAt: Date.now(),
    });
  }

  async function setReadRule(token: string, object: "companies" | "contacts" | "deals", field: string) {
    const response = await fieldPermissionRoutes.POST(
      req(token, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object, field, role: "viewer", canRead: false, canWrite: false }),
      }),
    );
    expect(response.status).toBe(200);
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    exportRoutes = await import("@/app/api/export/[entity]/route");
    fieldPermissionRoutes = await import("@/app/api/field-permissions/route");

    wsA = await createWorkspace({ id: "export-ws-a" });
    wsB = await createWorkspace({ id: "export-ws-b" });
    await seedKey(wsA, KEY.admin, "admin");
    await seedKey(wsA, KEY.member, "member");
    await seedKey(wsA, KEY.viewer, "viewer");
    await seedKey(wsB, KEY_B, "admin");

    await withWorkspace(wsA, async () => {
      await db.insert(tables.companies).values([
        {
          id: "company-a1",
          name: "Acme SaaS",
          domain: "acme.example",
          industry: "SaaS",
          size: "51-200",
          website: "https://acme.example",
          city: "Hanoi",
          country: "VN",
          annualRevenue: 120000,
          custom: "{}",
          createdAt: 1000,
          updatedAt: 2000,
        },
        {
          id: "company-a2",
          name: "Beta Finance",
          domain: "beta.example",
          industry: "Finance",
          size: "11-50",
          website: "https://beta.example",
          city: "Da Nang",
          country: "VN",
          annualRevenue: 0,
          custom: "{}",
          createdAt: 1001,
          updatedAt: 1000,
        },
        {
          id: "company-formula",
          name: "=2+2",
          domain: "formula.example",
          industry: "SaaS",
          size: "1-10",
          website: "https://formula.example",
          city: "Hue",
          country: "VN",
          annualRevenue: -12,
          custom: "{}",
          createdAt: 1002,
          updatedAt: 3000,
        },
      ]);
      await db.insert(tables.contacts).values({
        id: "contact-a1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        createdAt: 1000,
        updatedAt: 1000,
      });
      await db.insert(tables.pipelines).values({
        id: "pipeline-a1",
        name: "Default",
        isDefault: 1,
        createdAt: 1000,
      });
      await db.insert(tables.stages).values({
        id: "stage-a1",
        pipelineId: "pipeline-a1",
        name: "Qualified",
        order: 1,
      });
      await db.insert(tables.deals).values({
        id: "deal-a1",
        name: "Acme renewal",
        amount: -12,
        currency: "USD",
        pipelineId: "pipeline-a1",
        stageId: "stage-a1",
        stageEnteredAt: 1000,
        createdAt: 1000,
        updatedAt: 1000,
      });
    });
    await withWorkspace(wsB, async () => {
      await db.insert(tables.companies).values({
        id: "company-b1",
        name: "Workspace B secret",
        domain: "b.example",
        industry: "Private",
        size: "1-10",
        website: "https://b.example",
        city: "Can Tho",
        country: "VN",
        annualRevenue: 999,
        custom: "{}",
        createdAt: 1000,
        updatedAt: 1000,
      });
    });
  });

  it("keeps legacy all export workspace-scoped and spreadsheet-safe", async () => {
    const response = await exportRoutes.GET(req(KEY.admin, "/api/export/companies"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(response.status).toBe(200);
    const { bytes, text } = await csvResponse(response);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const rows = parseCsv(text);
    expect(rows[0]).toContain("annualRevenue");
    expect(rows.some((row) => row[0] === "'=2+2")).toBe(true);
    expect(rows.some((row) => row.includes("-12"))).toBe(true);
    expect(rows.some((row) => row[0] === "Workspace B secret")).toBe(false);
  });

  it("supports selected and filtered Companies, dropping cross-workspace IDs", async () => {
    const selected = await exportRoutes.GET(
      req(KEY.admin, "/api/export/companies?scope=selected&ids=company-a1,company-b1"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(selected.status).toBe(200);
    const selectedRows = parseCsv((await csvResponse(selected)).text);
    expect(selectedRows.slice(1).map((row) => row[0])).toEqual(["Acme SaaS"]);

    const filtered = await exportRoutes.GET(
      req(KEY.admin, "/api/export/companies?scope=filtered&q=Acme&sort=name_asc"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(filtered.status).toBe(200);
    const filteredRows = parseCsv((await csvResponse(filtered)).text);
    expect(filteredRows.slice(1).map((row) => row[0])).toEqual(["Acme SaaS"]);

    const copiedListPage = await exportRoutes.GET(
      req(KEY.admin, "/api/export/companies?scope=filtered&q=Acme&offset=-1&limit=1"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(copiedListPage.status).toBe(200);
    expect(parseCsv((await csvResponse(copiedListPage)).text).slice(1).map((row) => row[0])).toEqual(["Acme SaaS"]);
  });

  it("exports only readable columns for a viewer and preserves viewer access", async () => {
    await setReadRule(KEY.admin, "companies", "annualRevenue");
    const response = await exportRoutes.GET(req(KEY.viewer, "/api/export/companies"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(response.status).toBe(200);
    const rows = parseCsv((await csvResponse(response)).text);
    expect(rows[0]).not.toContain("annualRevenue");
    expect(rows.flat()).not.toContain("120000");
  });

  it("rejects hidden filter/sort/search policy without turning it into an oracle", async () => {
    await setReadRule(KEY.admin, "companies", "industry");
    const hiddenFilter = await exportRoutes.GET(
      req(KEY.viewer, "/api/export/companies?scope=filtered&industry=SaaS"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(hiddenFilter.status).toBe(403);

    const hiddenSort = await exportRoutes.GET(
      req(KEY.viewer, "/api/export/companies?scope=filtered&sort=annualRevenue_desc"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(hiddenSort.status).toBe(403);

    await setReadRule(KEY.admin, "companies", "name");
    await setReadRule(KEY.admin, "companies", "domain");
    const hiddenSearch = await exportRoutes.GET(
      req(KEY.viewer, "/api/export/companies?scope=filtered&q=secret"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(hiddenSearch.status).toBe(403);
  });

  it("does not use a hidden company id as a selected-export oracle", async () => {
    await setReadRule(KEY.admin, "companies", "id");

    const viewerSelected = await exportRoutes.GET(
      req(KEY.viewer, "/api/export/companies?scope=selected&ids=company-a1"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(viewerSelected.status).toBe(403);
    expect((await viewerSelected.json()).error).toMatch(/not readable/i);

    const viewerAll = await exportRoutes.GET(req(KEY.viewer, "/api/export/companies"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(viewerAll.status).toBe(200);
    expect(parseCsv((await csvResponse(viewerAll)).text)[0]).not.toContain("id");

    const adminSelected = await exportRoutes.GET(
      req(KEY.admin, "/api/export/companies?scope=selected&ids=company-a1"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(adminSelected.status).toBe(200);
    expect(parseCsv((await csvResponse(adminSelected)).text).slice(1).map((row) => row[0])).toContain("Acme SaaS");
  });

  it("keeps Contacts and Deals all-only in this phase", async () => {
    for (const entity of ["contacts", "deals"] as const) {
      const filtered = await exportRoutes.GET(
        req(KEY.admin, `/api/export/${entity}?scope=filtered`),
        { params: Promise.resolve({ entity }) },
      );
      expect(filtered.status).toBe(400);
      const selected = await exportRoutes.GET(
        req(KEY.admin, `/api/export/${entity}?scope=selected&ids=one`),
        { params: Promise.resolve({ entity }) },
      );
      expect(selected.status).toBe(400);
    }
  });

  it("rejects invalid credentials and unknown entities as JSON errors", async () => {
    const unauthorized = await exportRoutes.GET(req("frty_export_missing", "/api/export/companies"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(unauthorized.status).toBe(401);
    expect((await unauthorized.json()).error).toBeTruthy();

    const unknown = await exportRoutes.GET(req(KEY.admin, "/api/export/widgets"), {
      params: Promise.resolve({ entity: "widgets" }),
    });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBeTruthy();
  });

  it("keeps API keys confined to their workspace", async () => {
    const response = await exportRoutes.GET(req(KEY_B, "/api/export/companies"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    const rows = parseCsv((await csvResponse(response)).text);
    expect(rows.slice(1).map((row) => row[0])).toEqual(["Workspace B secret"]);

    const crossWorkspaceSelected = await exportRoutes.GET(
      req(KEY_B, "/api/export/companies?scope=selected&ids=company-a1"),
      { params: Promise.resolve({ entity: "companies" }) },
    );
    expect(parseCsv((await csvResponse(crossWorkspaceSelected)).text)).toHaveLength(1);
  });

  it("masks contact email and derived deal stage, while members retain readable fields", async () => {
    await setReadRule(KEY.admin, "contacts", "email");
    await setReadRule(KEY.admin, "deals", "stageId");

    const viewerContacts = await exportRoutes.GET(req(KEY.viewer, "/api/export/contacts"), {
      params: Promise.resolve({ entity: "contacts" }),
    });
    const contactRows = parseCsv((await csvResponse(viewerContacts)).text);
    expect(contactRows[0]).not.toContain("email");

    const viewerDeals = await exportRoutes.GET(req(KEY.viewer, "/api/export/deals"), {
      params: Promise.resolve({ entity: "deals" }),
    });
    const dealRows = parseCsv((await csvResponse(viewerDeals)).text);
    expect(dealRows[0]).not.toContain("stage");

    const memberContacts = await exportRoutes.GET(req(KEY.member, "/api/export/contacts"), {
      params: Promise.resolve({ entity: "contacts" }),
    });
    expect(memberContacts.status).toBe(200);
    expect(parseCsv((await csvResponse(memberContacts)).text)[0]).toContain("email");
  });

  it("rejects malformed scope, empty selection, and selections above 500 IDs", async () => {
    const malformed = await exportRoutes.GET(req(KEY.admin, "/api/export/companies?scope=oops"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(malformed.status).toBe(400);

    const empty = await exportRoutes.GET(req(KEY.admin, "/api/export/companies?scope=selected"), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(empty.status).toBe(400);

    const tooMany = Array.from({ length: 501 }, (_, i) => `id-${i}`).join(",");
    const overCap = await exportRoutes.GET(req(KEY.admin, `/api/export/companies?scope=selected&ids=${tooMany}`), {
      params: Promise.resolve({ entity: "companies" }),
    });
    expect(overCap.status).toBe(400);
  });

  it("keeps both export and entity authorization gates in the route", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/app/api/export/[entity]/route.ts"), "utf8");
    expect(source).toContain('authorize(auth, "export", "read")');
    expect(source).toContain('authorize(auth, entity, "read")');
  });
});
