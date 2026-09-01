import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Field-level permissions (Gate D1) through the real handlers on Postgres + RLS:
 * a rule hides a field from a role's reads and blocks its writes, admin bypasses,
 * and rules are workspace-scoped. Roles are carried by the API key's `role`.
 */
describe("field-level permissions (real handlers + Postgres + RLS)", () => {
  const KEY = { admin: "frty_fp_admin", member: "frty_fp_member", viewer: "frty_fp_viewer" };
  const KEY_B = "frty_fp_admin_b";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contacts: typeof import("@/app/api/contacts/route");
  let contactId: typeof import("@/app/api/contacts/[id]/route");
  let companies: typeof import("@/app/api/companies/route");
  let deals: typeof import("@/app/api/deals/route");
  let pipelines: typeof import("@/app/api/pipelines/route");
  let search: typeof import("@/app/api/search/route");
  let exportEntity: typeof import("@/app/api/export/[entity]/route");
  let fieldPerms: typeof import("@/app/api/field-permissions/route");
  let customFields: typeof import("@/app/api/custom-fields/route");

  const req = (token: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...init,
    });

  async function seedKey(ws: string, token: string, role: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: role,
      prefix: token.slice(0, 8),
      keyHash: sha256(token),
      role,
      createdAt: Date.now(),
    });
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contacts = await import("@/app/api/contacts/route");
    contactId = await import("@/app/api/contacts/[id]/route");
    companies = await import("@/app/api/companies/route");
    deals = await import("@/app/api/deals/route");
    pipelines = await import("@/app/api/pipelines/route");
    search = await import("@/app/api/search/route");
    exportEntity = await import("@/app/api/export/[entity]/route");
    fieldPerms = await import("@/app/api/field-permissions/route");
    customFields = await import("@/app/api/custom-fields/route");

    const wsA = await createWorkspace();
    const wsB = await createWorkspace();
    for (const role of ["admin", "member", "viewer"] as const) await seedKey(wsA, KEY[role], role);
    await seedKey(wsB, KEY_B, "admin");

    // Rule: viewers cannot READ contacts.email; members cannot WRITE contacts.status.
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "contacts", field: "email", role: "viewer", canRead: false, canWrite: false }),
      }),
    );
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "contacts", field: "status", role: "member", canRead: true, canWrite: false }),
      }),
    );
    // Seed a contact (as admin, unrestricted).
    await contacts.POST(
      req(KEY.admin, "/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@x.io",
          status: "qualified",
          jobTitle: "Mathematician",
        }),
      }),
    );
  });

  it("only admin can manage field permissions", async () => {
    const asMember = await fieldPerms.POST(
      req(KEY.member, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "contacts", field: "phone", role: "viewer", canRead: false, canWrite: true }),
      }),
    );
    expect(asMember.status).toBe(403);
    const asAdmin = await fieldPerms.GET(req(KEY.admin, "/api/field-permissions"));
    expect(asAdmin.status).toBe(200);
    expect((await asAdmin.json()).rules.length).toBeGreaterThanOrEqual(2);
  });

  it("redacts an unreadable field for the restricted role only", async () => {
    const asViewer = await contacts.GET(req(KEY.viewer, "/api/contacts"));
    const viewerRows = (await asViewer.json()).contacts;
    expect(viewerRows[0].firstName).toBe("Ada");
    expect("email" in viewerRows[0]).toBe(false); // redacted

    const asAdmin = await contacts.GET(req(KEY.admin, "/api/contacts"));
    const adminRows = (await asAdmin.json()).contacts;
    expect(adminRows[0].email).toBe("ada@x.io"); // admin unrestricted

    const asMember = await contacts.GET(req(KEY.member, "/api/contacts"));
    expect((await asMember.json()).contacts[0].email).toBe("ada@x.io"); // member may read email
  });

  it("redacts an unreadable field from command-palette search hits", async () => {
    const asViewer = await search.GET(req(KEY.viewer, "/api/search?q=Ada"));
    expect(asViewer.status).toBe(200);
    const hits = ((await asViewer.json()).results as { type: string; subtitle: string | null }[]).filter(
      (r) => r.type === "contact",
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((r) => r.subtitle?.includes("ada@x.io"))).toBe(false);

    const asAdmin = await search.GET(req(KEY.admin, "/api/search?q=Ada"));
    const adminHits = ((await asAdmin.json()).results as { type: string; subtitle: string | null }[]).filter(
      (r) => r.type === "contact",
    );
    expect(adminHits.some((r) => r.subtitle === "ada@x.io")).toBe(true);
  });

  it("omits an unreadable column from CSV export", async () => {
    const params = { params: Promise.resolve({ entity: "contacts" }) };
    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/contacts"), params);
    expect(asViewer.status).toBe(200);
    const csv = await asViewer.text();
    const header = csv.split(/\r?\n/)[0] ?? "";
    expect(header.split(",")).not.toContain("email");
    expect(csv).not.toMatch(/ada@x\.io/);

    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/contacts"), params);
    const adminCsv = await asAdmin.text();
    expect(adminCsv.split(/\r?\n/)[0]?.split(",")).toContain("email");
    expect(adminCsv).toMatch(/ada@x\.io/);
  });

  it("omits the company column when companyId is unreadable", async () => {
    const created = await companies.POST(
      req(KEY.admin, "/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: "Analytical Engines" }),
      }),
    );
    expect(created.status).toBe(201);
    const company = (await created.json()).company as { id: string; name: string };

    const listed = await contacts.GET(req(KEY.admin, "/api/contacts"));
    const ada = ((await listed.json()).contacts as { id: string; firstName: string }[]).find(
      (c) => c.firstName === "Ada",
    );
    expect(ada).toBeDefined();
    const patched = await contactId.PATCH(
      req(KEY.admin, `/api/contacts/${ada!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ companyId: company.id }),
      }),
      { params: Promise.resolve({ id: ada!.id }) },
    );
    expect(patched.status).toBe(200);

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "contacts",
          field: "companyId",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );

    const params = { params: Promise.resolve({ entity: "contacts" }) };
    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/contacts"), params);
    const viewerCsv = await asViewer.text();
    expect(viewerCsv.split(/\r?\n/)[0]?.split(",")).not.toContain("company");
    expect(viewerCsv).not.toMatch(/Analytical Engines/);

    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/contacts"), params);
    const adminCsv = await asAdmin.text();
    expect(adminCsv.split(/\r?\n/)[0]?.split(",")).toContain("company");
    expect(adminCsv).toMatch(/Analytical Engines/);
  });

  it("omits company linkedin from CSV when that field is unreadable", async () => {
    const created = await companies.POST(
      req(KEY.admin, "/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: "Babbage Ltd", linkedin: "https://linkedin.com/company/babbage" }),
      }),
    );
    expect(created.status).toBe(201);

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "companies",
          field: "linkedin",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );

    const params = { params: Promise.resolve({ entity: "companies" }) };
    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/companies"), params);
    const viewerCsv = await asViewer.text();
    expect(viewerCsv.split(/\r?\n/)[0]?.split(",")).not.toContain("linkedin");
    expect(viewerCsv).not.toMatch(/linkedin\.com\/company\/babbage/);

    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/companies"), params);
    const adminCsv = await asAdmin.text();
    expect(adminCsv.split(/\r?\n/)[0]?.split(",")).toContain("linkedin");
    expect(adminCsv).toMatch(/linkedin\.com\/company\/babbage/);
  });

  it("omits deal company, stage, and score columns when those fields are unreadable", async () => {
    const createdCo = await companies.POST(
      req(KEY.admin, "/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: "Difference Engine" }),
      }),
    );
    expect(createdCo.status).toBe(201);
    const company = (await createdCo.json()).company as { id: string };

    const createdDeal = await deals.POST(
      req(KEY.admin, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Census contract", companyId: company.id }),
      }),
    );
    expect(createdDeal.status).toBe(201);

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "deals",
          field: "companyId",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "deals",
          field: "stageId",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "deals",
          field: "score",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );

    const params = { params: Promise.resolve({ entity: "deals" }) };
    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/deals"), params);
    const viewerCsv = await asViewer.text();
    const viewerHeader = viewerCsv.split(/\r?\n/)[0]?.split(",") ?? [];
    expect(viewerHeader).not.toContain("company");
    expect(viewerHeader).not.toContain("stage");
    expect(viewerHeader).not.toContain("score");
    expect(viewerCsv).not.toMatch(/Difference Engine/);

    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/deals"), params);
    const adminCsv = await asAdmin.text();
    const adminHeader = adminCsv.split(/\r?\n/)[0]?.split(",") ?? [];
    expect(adminHeader).toContain("company");
    expect(adminHeader).toContain("stage");
    expect(adminHeader).toContain("score");
    expect(adminCsv).toMatch(/Difference Engine/);
    expect(adminCsv).toMatch(/Census contract/);
    expect(adminCsv).toMatch(/Lead/);
  });

  it("omits deal contact from CSV when that field is unreadable", async () => {
    const createdContact = await contacts.POST(
      req(KEY.admin, "/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Charles", lastName: "Babbage" }),
      }),
    );
    expect(createdContact.status).toBe(201);
    const person = (await createdContact.json()).contact as { id: string };

    const createdDeal = await deals.POST(
      req(KEY.admin, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Analytical Engine licence", contactId: person.id }),
      }),
    );
    expect(createdDeal.status).toBe(201);

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "deals",
          field: "contactId",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );

    const params = { params: Promise.resolve({ entity: "deals" }) };
    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/deals"), params);
    const viewerCsv = await asViewer.text();
    expect(viewerCsv.split(/\r?\n/)[0]?.split(",")).not.toContain("contact");
    expect(viewerCsv).not.toMatch(/Charles Babbage/);

    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/deals"), params);
    const adminCsv = await asAdmin.text();
    expect(adminCsv.split(/\r?\n/)[0]?.split(",")).toContain("contact");
    expect(adminCsv).toMatch(/Charles Babbage/);
    expect(adminCsv).toMatch(/Analytical Engine licence/);
  });

  it("omits deal pipeline from CSV when that field is unreadable", async () => {
    const createdPipe = await pipelines.POST(
      req(KEY.admin, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: "Enterprise motion" }),
      }),
    );
    expect(createdPipe.status).toBe(201);
    const pipeline = (await createdPipe.json()).pipeline as { id: string };

    const createdDeal = await deals.POST(
      req(KEY.admin, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Fleet rollout", pipelineId: pipeline.id }),
      }),
    );
    expect(createdDeal.status).toBe(201);

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "deals",
          field: "pipelineId",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );

    const params = { params: Promise.resolve({ entity: "deals" }) };
    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/deals"), params);
    const viewerCsv = await asViewer.text();
    expect(viewerCsv.split(/\r?\n/)[0]?.split(",")).not.toContain("pipeline");
    expect(viewerCsv).not.toMatch(/Enterprise motion/);

    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/deals"), params);
    const adminCsv = await asAdmin.text();
    expect(adminCsv.split(/\r?\n/)[0]?.split(",")).toContain("pipeline");
    expect(adminCsv).toMatch(/Enterprise motion/);
    expect(adminCsv).toMatch(/Fleet rollout/);
  });

  it("exports custom fields and omits them when custom is unreadable", async () => {
    const field = await customFields.POST(
      req(KEY.admin, "/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({ entity: "contact", key: "tier", label: "Tier", type: "text" }),
      }),
    );
    expect(field.status).toBe(201);

    const created = await contacts.POST(
      req(KEY.admin, "/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Grace", lastName: "Hopper", custom: { tier: "flag-officer" } }),
      }),
    );
    expect(created.status).toBe(201);

    const params = { params: Promise.resolve({ entity: "contacts" }) };
    const asAdmin = await exportEntity.GET(req(KEY.admin, "/api/export/contacts"), params);
    const adminCsv = await asAdmin.text();
    expect(adminCsv.split(/\r?\n/)[0]?.split(",")).toContain("tier");
    expect(adminCsv).toMatch(/flag-officer/);

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({
          object: "contacts",
          field: "custom",
          role: "viewer",
          canRead: false,
          canWrite: false,
        }),
      }),
    );

    const asViewer = await exportEntity.GET(req(KEY.viewer, "/api/export/contacts"), params);
    const viewerCsv = await asViewer.text();
    expect(viewerCsv.split(/\r?\n/)[0]?.split(",")).not.toContain("tier");
    expect(viewerCsv).not.toMatch(/flag-officer/);
  });

  it("redacts unreadable fields from dashboard and report record lists", async () => {
    const { withWorkspace } = await import("@/db");
    const { ensureDefaultPipeline } = await import("@/db/seed");
    const dashboard = await import("@/app/api/stats/dashboard/route");
    const reports = await import("@/app/api/stats/reports/route");

    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "contacts", field: "jobTitle", role: "viewer", canRead: false, canWrite: false }),
      }),
    );
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "contacts", field: "firstName", role: "viewer", canRead: false, canWrite: false }),
      }),
    );
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "deals", field: "amount", role: "viewer", canRead: false, canWrite: false }),
      }),
    );

    const wsA = (await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.keyHash, sha256(KEY.viewer))))[0]
      .workspaceId;
    await withWorkspace(wsA, async () => {
      const pipelineId = await ensureDefaultPipeline();
      const stage = (await db.select().from(tables.stages)).find((s) => s.type === "open");
      expect(stage).toBeTruthy();
      await db.insert(tables.deals).values({
        id: newId(),
        name: "Hidden amount deal",
        amount: 424242,
        currency: "USD",
        pipelineId,
        stageId: stage!.id,
        stageEnteredAt: Date.now() - 20 * 86_400_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const asViewer = await dashboard.GET(req(KEY.viewer, "/api/stats/dashboard"));
    expect(asViewer.status).toBe(200);
    const viewerDash = await asViewer.json();
    expect(viewerDash.hotLeads.every((l: Record<string, unknown>) => !("jobTitle" in l))).toBe(true);
    expect(JSON.stringify(viewerDash.hotLeads)).not.toMatch(/Mathematician/);
    expect(JSON.stringify(viewerDash.hotLeads)).not.toMatch(/\bAda\b/);
    expect(viewerDash.hotLeads.some((l: { name?: string }) => l.name === "Lovelace")).toBe(true);
    expect(viewerDash.hotLeads.every((l: Record<string, unknown>) => !("firstName" in l) && !("lastName" in l))).toBe(
      true,
    );
    const stale = (viewerDash.staleDeals as { name: string; amount?: number }[]).find(
      (d) => d.name === "Hidden amount deal",
    );
    expect(stale).toBeTruthy();
    expect("amount" in stale!).toBe(false);
    expect("pipelineValue" in viewerDash.kpis).toBe(false);
    expect("weightedForecast" in viewerDash.kpis).toBe(false);
    expect("wonThisMonth" in viewerDash.kpis).toBe(false);
    expect("avgDealSize" in viewerDash.kpis).toBe(false);
    expect(viewerDash.funnel.every((f: Record<string, unknown>) => !("value" in f))).toBe(true);
    expect(viewerDash.revenueByMonth.every((r: Record<string, unknown>) => !("won" in r) && !("lost" in r))).toBe(
      true,
    );
    expect(JSON.stringify(viewerDash)).not.toMatch(/424242/);

    const asAdmin = await dashboard.GET(req(KEY.admin, "/api/stats/dashboard"));
    const adminDash = await asAdmin.json();
    expect((adminDash.hotLeads as { jobTitle?: string; name?: string }[]).some((l) => l.jobTitle === "Mathematician")).toBe(
      true,
    );
    expect((adminDash.hotLeads as { name?: string }[]).some((l) => l.name === "Ada Lovelace")).toBe(true);
    const adminStale = (adminDash.staleDeals as { name: string; amount?: number }[]).find(
      (d) => d.name === "Hidden amount deal",
    );
    expect(adminStale?.amount).toBe(424242);
    expect(adminDash.kpis.pipelineValue).toBe(424242);

    const viewerReports = await reports.GET(req(KEY.viewer, "/api/stats/reports"));
    expect(viewerReports.status).toBe(200);
    const aging = ((await viewerReports.json()).aging as { name: string; amountUsd?: number }[]).find(
      (d) => d.name === "Hidden amount deal",
    );
    expect(aging).toBeTruthy();
    expect("amountUsd" in aging!).toBe(false);

    const adminReports = await reports.GET(req(KEY.admin, "/api/stats/reports"));
    const adminAging = ((await adminReports.json()).aging as { name: string; amountUsd?: number }[]).find(
      (d) => d.name === "Hidden amount deal",
    );
    expect(adminAging?.amountUsd).toBe(424242);
  });

  it("does not put an unreadable field into the per-record AI prompt", async () => {
    const { withWorkspace } = await import("@/db");
    const { loadRecordContext } = await import("@/lib/ai/record-context");
    const listed = await contacts.GET(req(KEY.admin, "/api/contacts"));
    const ada = ((await listed.json()).contacts as { id: string; email: string }[]).find((c) => c.email === "ada@x.io");
    expect(ada).toBeTruthy();
    const wsA = (await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.keyHash, sha256(KEY.viewer))))[0]
      .workspaceId;
    const asViewer = await withWorkspace(wsA, () => loadRecordContext("contact", ada!.id, "viewer"));
    expect(asViewer?.facts.some((f) => /email/i.test(f))).toBe(false);
    expect(asViewer?.facts.some((f) => f.includes("ada@x.io"))).toBe(false);
    const asAdmin = await withWorkspace(wsA, () => loadRecordContext("contact", ada!.id, "admin"));
    expect(asAdmin?.facts.some((f) => f.includes("ada@x.io"))).toBe(true);
  });

  it("blocks a write to a non-writable field, but allows omitting it", async () => {
    const blocked = await contacts.POST(
      req(KEY.member, "/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Grace", status: "customer" }),
      }),
    );
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error).toMatch(/status/);

    // Omitting the blocked field is fine (default applies, not a caller write).
    const ok = await contacts.POST(
      req(KEY.member, "/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Grace" }) }),
    );
    expect(ok.status).toBe(201);
  });

  it("clearing a rule (both flags true) removes it", async () => {
    await fieldPerms.POST(
      req(KEY.admin, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "contacts", field: "status", role: "member", canRead: true, canWrite: true }),
      }),
    );
    // Member can now write status again.
    const ok = await contacts.POST(
      req(KEY.member, "/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Kay", status: "customer" }),
      }),
    );
    expect(ok.status).toBe(201);
  });

  it("exposes the caller's own field restrictions (not other roles')", async () => {
    const me = await import("@/app/api/field-permissions/me/route");
    const asViewer = await me.GET(req(KEY.viewer, "/api/field-permissions/me"));
    expect(asViewer.status).toBe(200);
    const viewer = await asViewer.json();
    expect(viewer.hidden.contacts).toContain("email");
    expect(viewer.blockedWrites.contacts).toContain("email");

    const asAdmin = await me.GET(req(KEY.admin, "/api/field-permissions/me"));
    const admin = await asAdmin.json();
    expect(admin.hidden.contacts).toEqual([]);
    expect(admin.blockedWrites.deals).toEqual([]);

    const asMember = await me.GET(req(KEY.member, "/api/field-permissions/me"));
    const member = await asMember.json();
    expect(member.hidden.contacts ?? []).not.toContain("email");
  });

  it("rules are confined to their workspace (RLS)", async () => {
    // Workspace B has no rules → its admin sees an unrestricted, empty rule set.
    const asB = await fieldPerms.GET(req(KEY_B, "/api/field-permissions"));
    expect((await asB.json()).rules).toHaveLength(0);
  });
});
