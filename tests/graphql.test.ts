import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Auto-generated GraphQL API (Gate C2) through the real POST /api/graphql handler
 * on real Postgres + RLS: introspection, typed queries, mutations, custom-object
 * records, RBAC (viewer denied writes), and cross-workspace isolation.
 */
describe("GraphQL API (real handler + Postgres + RLS)", () => {
  const ADMIN_A = "frty_gql_admin_a";
  const ADMIN_B = "frty_gql_admin_b";
  const VIEWER_A = "frty_gql_viewer_a";
  const MEMBER_A = "frty_gql_member_a";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let gql: typeof import("@/app/api/graphql/route");

  const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, "content-type": "application/json" });
  async function run(token: string, query: string, variables?: Record<string, unknown>) {
    const res = await gql.POST(
      new Request("http://localhost/api/graphql", {
        method: "POST",
        headers: hdr(token),
        body: JSON.stringify({ query, variables }),
      }),
    );
    return { status: res.status, body: await res.json() };
  }

  async function seedKey(ws: string, token: string, role: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
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
    gql = await import("@/app/api/graphql/route");

    const wsA = await createWorkspace();
    const wsB = await createWorkspace();
    await seedKey(wsA, ADMIN_A, "admin");
    await seedKey(wsB, ADMIN_B, "admin");
    await seedKey(wsA, VIEWER_A, "viewer");
    await seedKey(wsA, MEMBER_A, "member");
  });

  it("introspects the schema (Query + Mutation types present)", async () => {
    const { status, body } = await run(ADMIN_A, "{ __schema { queryType { name } mutationType { name } } }");
    expect(status).toBe(200);
    expect(body.data.__schema.queryType.name).toBe("Query");
    expect(body.data.__schema.mutationType.name).toBe("Mutation");
  });

  it("creates and queries a contact, with custom JSON scalar", async () => {
    const created = await run(
      ADMIN_A,
      `mutation ($i: JSON!) { createContact(input: $i) { id firstName score custom } }`,
      { i: { firstName: "Ada", lastName: "Lovelace", email: "ada@analytical.engine", custom: { tier: "gold" } } },
    );
    expect(created.status).toBe(200);
    expect(created.body.errors).toBeUndefined();
    const c = created.body.data.createContact;
    expect(c.firstName).toBe("Ada");
    expect(typeof c.score).toBe("number");
    expect(c.custom.tier).toBe("gold");

    const listed = await run(ADMIN_A, `{ contacts(limit: 10) { firstName email } }`);
    expect(listed.body.data.contacts.some((x: { email: string }) => x.email === "ada@analytical.engine")).toBe(true);
  });

  it("serves the documented contacts(sort) query with a nested company", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id name } }`, {
      i: { name: "Analytical Engines" },
    });
    expect(co.body.errors).toBeUndefined();
    const company = co.body.data.createCompany as { id: string; name: string };
    const linked = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Charles", lastName: "Babbage", companyId: company.id },
    });
    expect(linked.body.errors).toBeUndefined();

    const res = await run(
      ADMIN_A,
      `{ contacts(sort: "score") { id firstName score company { name } } }`,
    );
    expect(res.body.errors).toBeUndefined();
    const rows = res.body.data.contacts as { firstName: string; company: { name: string } | null }[];
    expect(rows.some((c) => c.firstName === "Charles" && c.company?.name === "Analytical Engines")).toBe(true);
  });

  it("searches contacts over the same fields the REST list searches", async () => {
    // Searching only by first name made the GraphQL list quietly less useful
    // than the REST one: a lookup by surname, email, or job title found nothing.
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Grace", lastName: "Hopper", email: "grace@navy.mil", jobTitle: "Rear Admiral" },
    });
    const found = async (q: string) =>
      (await run(ADMIN_A, `query ($q: String) { contacts(q: $q) { lastName } }`, { q })).body.data.contacts.map(
        (c: { lastName: string }) => c.lastName,
      );

    expect(await found("Grace")).toContain("Hopper");
    expect(await found("Hopper")).toContain("Hopper");
    expect(await found("navy.mil")).toContain("Hopper");
    expect(await found("Admiral")).toContain("Hopper");
    expect(await found("  Hopper  ")).toContain("Hopper");
    expect(await found("nobody-by-this-name")).not.toContain("Hopper");
  });

  it("searches contacts companies and deals in one query, prefix-only like MCP", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Fernhill Search Co", domain: "fernhillsearch.example" },
    });
    const companyId = co.body.data.createCompany.id as string;
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Ada", lastName: "Marchetti", companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Bo", lastName: "Marchetta" },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Fernhill fleet", companyId },
    });

    const hit = await run(
      ADMIN_A,
      `{ search(q: "Marchetti") { contacts { firstName lastName company { name } } note } }`,
    );
    expect(hit.body.errors).toBeUndefined();
    const people = hit.body.data.search.contacts as {
      firstName: string;
      lastName: string;
      company: { name: string } | null;
    }[];
    expect(people.map((c) => c.lastName)).toEqual(["Marchetti"]);
    expect(people[0].company?.name).toBe("Fernhill Search Co");
    expect(hit.body.data.search.note).toBeNull();

    const near = await run(ADMIN_A, `{ search(q: "Marchetta") { contacts { firstName } } }`);
    expect(near.body.data.search.contacts.map((c: { firstName: string }) => c.firstName)).toEqual(["Bo"]);

    const infix = await run(ADMIN_A, `{ search(q: "hill Search Co") { companies { name } note } }`);
    expect(infix.body.data.search.companies).toEqual([]);
    expect(infix.body.data.search.note).toMatch(/not fuzzy/i);

    const wild = await run(ADMIN_A, `{ search(q: "%") { contacts { id } companies { id } deals { id } records { id } note } }`);
    expect(wild.body.errors).toBeUndefined();
    expect(wild.body.data.search.contacts).toEqual([]);
    expect(wild.body.data.search.companies).toEqual([]);
    expect(wild.body.data.search.deals).toEqual([]);
    expect(wild.body.data.search.records).toEqual([]);

    const companies = await run(ADMIN_A, `{ search(q: "Fernhill Search") { companies { name } } }`);
    expect(
      (companies.body.data.search.companies as { name: string }[]).some((c) => c.name === "Fernhill Search Co"),
    ).toBe(true);
    const deals = await run(ADMIN_A, `{ search(q: "Fernhill fleet") { deals { name company { name } } } }`);
    expect(deals.body.errors).toBeUndefined();
    expect(
      (deals.body.data.search.deals as { name: string; company: { name: string } | null }[]).some(
        (d) => d.name === "Fernhill fleet" && d.company?.name === "Fernhill Search Co",
      ),
    ).toBe(true);
  });

  it("searches custom-object records by title prefix", async () => {
    const { withWorkspace } = await import("@/db");
    const wsA = (await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.keyHash, sha256(ADMIN_A))))[0]
      .workspaceId;
    const objId = newId();
    const recId = newId();
    const now = Date.now();
    await withWorkspace(wsA, async () => {
      await db.insert(tables.customObjects).values({
        id: objId,
        apiName: "searchable",
        nameSingular: "Searchable",
        namePlural: "Searchables",
        createdAt: now,
      });
      await db.insert(tables.customObjectFields).values({
        id: newId(),
        objectId: objId,
        key: "title",
        label: "Title",
        type: "text",
        required: 1,
        order: 0,
        createdAt: now,
      });
      await db.insert(tables.customRecords).values({
        id: recId,
        objectId: objId,
        data: JSON.stringify({ title: "Orion Ticket" }),
        createdAt: now,
        updatedAt: now,
      });
    });

    const prefix = await run(
      ADMIN_A,
      `{ search(q: "Ori") { records { id object data } note } }`,
    );
    expect(prefix.body.errors).toBeUndefined();
    const rows = prefix.body.data.search.records as { id: string; object: string; data: { title: string } }[];
    expect(rows.some((r) => r.id === recId && r.object === "searchable" && r.data.title === "Orion Ticket")).toBe(
      true,
    );
    expect(prefix.body.data.search.note).toBeNull();

    const infix = await run(ADMIN_A, `{ search(q: "Ticket") { records { id } note } }`);
    expect(infix.body.data.search.records).toEqual([]);
    expect(infix.body.data.search.note).toMatch(/not fuzzy/i);
  });

  it("serves dashboard stats like REST/MCP, scoped to the workspace", async () => {
    const asA = await run(
      ADMIN_A,
      `{ dashboardStats { kpis { contacts openDeals } funnel { stage count } hotLeads { name } staleDeals { name } } }`,
    );
    expect(asA.body.errors).toBeUndefined();
    expect(asA.body.data.dashboardStats.kpis.contacts).toBeGreaterThan(0);
    expect(Array.isArray(asA.body.data.dashboardStats.funnel)).toBe(true);

    const asB = await run(
      ADMIN_B,
      `{ dashboardStats { kpis { contacts openDeals } hotLeads { name } staleDeals { name } } }`,
    );
    expect(asB.body.errors).toBeUndefined();
    expect(asB.body.data.dashboardStats.kpis.contacts).toBe(0);
    expect(asB.body.data.dashboardStats.kpis.openDeals).toBe(0);
    expect(asB.body.data.dashboardStats.hotLeads).toEqual([]);
    expect(asB.body.data.dashboardStats.staleDeals).toEqual([]);
  });

  it("lists pipelines and stages like REST GET /api/pipelines", async () => {
    const asA = await run(
      ADMIN_A,
      `{ pipelines { id name stages { name type order } } stages { name pipelineId } }`,
    );
    expect(asA.body.errors).toBeUndefined();
    expect(asA.body.data.pipelines.length).toBeGreaterThan(0);
    const pipeline = asA.body.data.pipelines[0] as {
      id: string;
      name: string;
      stages: { name: string }[];
    };
    expect(pipeline.stages.length).toBeGreaterThan(0);
    const one = await run(ADMIN_A, `query ($id: ID!) { pipeline(id: $id) { id name } }`, { id: pipeline.id });
    expect(one.body.data.pipeline.id).toBe(pipeline.id);
    const missing = await run(ADMIN_A, `{ pipeline(id: "no-such-pipeline") { id } }`);
    expect(missing.body.errors).toBeUndefined();
    expect(missing.body.data.pipeline).toBeNull();
    const filtered = await run(
      ADMIN_A,
      `query ($id: String) { stages(pipelineId: $id) { pipelineId } }`,
      { id: pipeline.id },
    );
    expect(
      (filtered.body.data.stages as { pipelineId: string }[]).every((s) => s.pipelineId === pipeline.id),
    ).toBe(true);
  });

  it("serves report stats like REST, scoped to the workspace", async () => {
    const asA = await run(
      ADMIN_A,
      `{ reportStats { sourceBreakdown { source leads } winLoss { month won lost } scoreBands { band count } statusBreakdown { status count } } }`,
    );
    expect(asA.body.errors).toBeUndefined();
    expect(Array.isArray(asA.body.data.reportStats.sourceBreakdown)).toBe(true);
    expect(asA.body.data.reportStats.winLoss).toHaveLength(6);
    expect(asA.body.data.reportStats.scoreBands.length).toBeGreaterThan(0);

    const asB = await run(
      ADMIN_B,
      `{ reportStats { sourceBreakdown { source leads } statusBreakdown { status count } aging { id } } }`,
    );
    expect(asB.body.errors).toBeUndefined();
    expect(asB.body.data.reportStats.sourceBreakdown).toEqual([]);
    expect(asB.body.data.reportStats.aging).toEqual([]);
    expect(
      (asB.body.data.reportStats.statusBreakdown as { count: number }[]).every((row) => row.count === 0),
    ).toBe(true);
  });

  it("lists contacts filtered by status and company, matching REST/MCP", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Navy Labs" },
    });
    const companyId = co.body.data.createCompany.id as string;
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Customer", lastName: "One", status: "customer", companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Lead", lastName: "Two", status: "lead", companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Elsewhere", lastName: "Three", status: "customer" },
    });

    const byStatus = await run(ADMIN_A, `{ contacts(status: "customer") { firstName status } }`);
    expect(byStatus.body.errors).toBeUndefined();
    const statusRows = byStatus.body.data.contacts as { firstName: string; status: string }[];
    expect(statusRows.every((c) => c.status === "customer")).toBe(true);
    expect(statusRows.some((c) => c.firstName === "Customer")).toBe(true);
    expect(statusRows.some((c) => c.firstName === "Lead")).toBe(false);

    const byCompany = await run(
      ADMIN_A,
      `query ($id: String) { contacts(companyId: $id) { firstName companyId } }`,
      { id: companyId },
    );
    expect(byCompany.body.errors).toBeUndefined();
    const companyRows = byCompany.body.data.contacts as { firstName: string; companyId: string }[];
    expect(companyRows.every((c) => c.companyId === companyId)).toBe(true);
    expect(companyRows.some((c) => c.firstName === "Customer")).toBe(true);
    expect(companyRows.some((c) => c.firstName === "Elsewhere")).toBe(false);
  });

  it("denies a viewer key from mutating (RBAC in resolver)", async () => {
    const res = await run(VIEWER_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Nope" },
    });
    expect(res.body.data?.createContact ?? null).toBeNull();
    expect(res.body.errors?.[0].extensions.code).toBe("FORBIDDEN");
    // Viewer can still read.
    const read = await run(VIEWER_A, `{ contacts { id } }`);
    expect(read.body.errors).toBeUndefined();
  });

  it("supports custom objects + records through GraphQL", async () => {
    // Define an object + field directly (management is exercised in custom-objects.test).
    const { withWorkspace } = await import("@/db");
    const wsA = (await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.keyHash, sha256(ADMIN_A))))[0].workspaceId;
    const objId = newId();
    await withWorkspace(wsA, async () => {
      await db.insert(tables.customObjects).values({
        id: objId,
        apiName: "ticket",
        nameSingular: "Ticket",
        namePlural: "Tickets",
        createdAt: Date.now(),
      });
      await db.insert(tables.customObjectFields).values({
        id: newId(),
        objectId: objId,
        key: "subject",
        label: "Subject",
        type: "text",
        required: 1,
        order: 0,
        createdAt: Date.now(),
      });
    });

    const created = await run(
      ADMIN_A,
      `mutation ($d: JSON!) { createRecord(object: "ticket", data: $d) { id data } }`,
      { d: { subject: "Printer broken" } },
    );
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createRecord.data.subject).toBe("Printer broken");
    const recId = created.body.data.createRecord.id as string;
    const createdTypes = await withWorkspace(wsA, async () =>
      (await db.select().from(tables.activities).where(eq(tables.activities.entityId, recId))).map((a) => a.type),
    );
    expect(createdTypes).toContain("created");

    const updated = await run(
      ADMIN_A,
      `mutation ($id: ID!, $d: JSON!) { updateRecord(object: "ticket", id: $id, data: $d) { data } }`,
      { id: recId, d: { subject: "Printer fixed" } },
    );
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateRecord.data.subject).toBe("Printer fixed");
    const updatedTypes = await withWorkspace(wsA, async () =>
      (await db.select().from(tables.activities).where(eq(tables.activities.entityId, recId))).map((a) => a.type),
    );
    expect(updatedTypes).toContain("updated");

    // Missing required field → BAD_USER_INPUT
    const bad = await run(ADMIN_A, `mutation ($d: JSON!) { createRecord(object: "ticket", data: $d) { id } }`, {
      d: {},
    });
    expect(bad.body.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");

    const records = await run(ADMIN_A, `{ records(object: "ticket") { data } }`);
    expect(records.body.data.records.length).toBe(1);

    await run(ADMIN_A, `mutation ($d: JSON!) { createRecord(object: "ticket", data: $d) { id } }`, {
      d: { subject: "Inbox overflow" },
    });
    const filtered = await run(ADMIN_A, `{ records(object: "ticket", q: "printer", sort: "subject") { data } }`);
    expect(filtered.body.errors).toBeUndefined();
    const subjects = (filtered.body.data.records as { data: { subject: string } }[]).map((r) => r.data.subject);
    expect(subjects).toEqual(["Printer fixed"]);

    const ticketTask = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Fix printer", entityType: "ticket", entityId: recId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "On site", entityType: "ticket", entityId: recId },
    });
    const kids = await run(
      ADMIN_A,
      `query ($id: ID!) { record(object: "ticket", id: $id) { tasks { title } notes { body } activities { type } } }`,
      { id: recId },
    );
    expect(kids.body.errors).toBeUndefined();
    expect((kids.body.data.record.tasks as { title: string }[]).some((t) => t.title === "Fix printer")).toBe(true);
    expect((kids.body.data.record.notes as { body: string }[]).some((n) => n.body === "On site")).toBe(true);
    expect((kids.body.data.record.activities as { type: string }[]).some((a) => a.type === "created")).toBe(true);

    const pin = `{ contact { firstName } company { name } deal { name } record { data tasks { title } } }`;
    const pinnedTask = await run(
      ADMIN_A,
      `query ($id: ID!) { task(id: $id) ${pin} }`,
      { id: ticketTask.body.data.createTask.id },
    );
    expect(pinnedTask.body.errors).toBeUndefined();
    expect(pinnedTask.body.data.task).toEqual({
      contact: null,
      company: null,
      deal: null,
      record: { data: { subject: "Printer fixed" }, tasks: [{ title: "Fix printer" }] },
    });

    const pinnedNotes = await run(
      ADMIN_A,
      `query ($id: String) { notes(entityType: "ticket", entityId: $id) { body contact { firstName } company { name } deal { name } record { data } } }`,
      { id: recId },
    );
    expect(pinnedNotes.body.errors).toBeUndefined();
    expect(
      (
        pinnedNotes.body.data.notes as {
          body: string;
          contact: unknown;
          company: unknown;
          deal: unknown;
          record: { data: { subject: string } } | null;
        }[]
      ).some(
        (n) =>
          n.body === "On site" &&
          n.contact === null &&
          n.company === null &&
          n.deal === null &&
          n.record?.data.subject === "Printer fixed",
      ),
    ).toBe(true);

    const pinnedActs = await run(
      ADMIN_A,
      `query ($id: String) { activities(entityType: "ticket", entityId: $id) { type contact { firstName } company { name } deal { name } record { data } } }`,
      { id: recId },
    );
    expect(pinnedActs.body.errors).toBeUndefined();
    expect(
      (
        pinnedActs.body.data.activities as {
          type: string;
          contact: unknown;
          company: unknown;
          deal: unknown;
          record: { data: { subject: string } } | null;
        }[]
      ).some(
        (a) =>
          a.type === "created" &&
          a.contact === null &&
          a.company === null &&
          a.deal === null &&
          a.record?.data.subject === "Printer fixed",
      ),
    ).toBe(true);
  });

  it("confines queries to the caller's workspace (RLS)", async () => {
    // Workspace B sees none of workspace A's contacts.
    const asB = await run(ADMIN_B, `{ contacts { email } }`);
    expect(asB.body.data.contacts.some((x: { email: string }) => x.email === "ada@analytical.engine")).toBe(false);
    // And cannot see workspace A's custom object.
    const objB = await run(ADMIN_B, `{ records(object: "ticket") { id } }`);
    expect(objB.body.errors?.[0].extensions.code).toBe("NOT_FOUND");
  });

  it("enforces field-level permissions (redacts reads, blocks writes)", async () => {
    const { withWorkspace } = await import("@/db");
    const wsA = (await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.keyHash, sha256(ADMIN_A))))[0].workspaceId;
    // viewer cannot read contacts.email; member cannot write contacts.status.
    await withWorkspace(wsA, async () => {
      await db.insert(tables.fieldPermissions).values([
        { id: newId(), object: "contacts", field: "email", role: "viewer", canRead: 0, canWrite: 0, createdAt: Date.now() },
        { id: newId(), object: "contacts", field: "status", role: "member", canRead: 1, canWrite: 0, createdAt: Date.now() },
        { id: newId(), object: "deals", field: "amount", role: "viewer", canRead: 0, canWrite: 0, createdAt: Date.now() },
      ]);
    });

    // Viewer's email is redacted to null; admin still reads it (bypass).
    const asViewer = await run(VIEWER_A, `{ contacts { firstName email } }`);
    expect(asViewer.body.errors).toBeUndefined();
    expect(asViewer.body.data.contacts.length).toBeGreaterThan(0);
    expect(asViewer.body.data.contacts.every((c: { email: unknown }) => c.email === null)).toBe(true);
    const asAdmin = await run(ADMIN_A, `{ contacts { email } }`);
    expect(asAdmin.body.data.contacts.some((c: { email: string }) => c.email === "ada@analytical.engine")).toBe(true);

    const searchViewer = await run(VIEWER_A, `{ search(q: "Ada") { contacts { firstName email } } }`);
    expect(searchViewer.body.errors).toBeUndefined();
    expect(
      (searchViewer.body.data.search.contacts as { email: unknown }[]).every((c) => c.email === null),
    ).toBe(true);

    const dashViewer = await run(
      VIEWER_A,
      `{ dashboardStats { kpis { pipelineValue weightedForecast wonThisMonth avgDealSize contacts } funnel { value } staleDeals { amount } } }`,
    );
    expect(dashViewer.body.errors).toBeUndefined();
    expect(dashViewer.body.data.dashboardStats.kpis.pipelineValue).toBeNull();
    expect(dashViewer.body.data.dashboardStats.kpis.weightedForecast).toBeNull();
    expect(dashViewer.body.data.dashboardStats.kpis.wonThisMonth).toBeNull();
    expect(dashViewer.body.data.dashboardStats.kpis.avgDealSize).toBeNull();
    expect(dashViewer.body.data.dashboardStats.kpis.contacts).toBeGreaterThan(0);
    expect(
      (dashViewer.body.data.dashboardStats.funnel as { value: unknown }[]).every((row) => row.value === null),
    ).toBe(true);
    expect(
      (dashViewer.body.data.dashboardStats.staleDeals as { amount: unknown }[]).every((row) => row.amount === null),
    ).toBe(true);

    const reportViewer = await run(
      VIEWER_A,
      `{ reportStats { aging { name amountUsd overdue stage } } }`,
    );
    expect(reportViewer.body.errors).toBeUndefined();
    expect(
      (reportViewer.body.data.reportStats.aging as { amountUsd: unknown }[]).every((row) => row.amountUsd == null),
    ).toBe(true);

    // Member writing the blocked field is refused; omitting it works.
    const blocked = await run(MEMBER_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Blocked", status: "customer" },
    });
    expect(blocked.body.errors?.[0].extensions.code).toBe("FORBIDDEN");
    expect(blocked.body.errors?.[0].message).toMatch(/status/);
    const ok = await run(MEMBER_A, `mutation ($i: JSON!) { createContact(input: $i) { id firstName } }`, {
      i: { firstName: "Allowed" },
    });
    expect(ok.body.errors).toBeUndefined();
    expect(ok.body.data.createContact.firstName).toBe("Allowed");
  });

  it("creates, moves, and deletes a deal (stage change fires won)", async () => {
    const { withWorkspace } = await import("@/db");
    const wsA = (await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.keyHash, sha256(ADMIN_A))))[0]
      .workspaceId;
    await withWorkspace(wsA, async () => {
      await db.insert(tables.workflows).values({
        id: newId(),
        name: "gql won note",
        enabled: 1,
        trigger: JSON.stringify({ event: "deal.won" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "add_note", body: "won {{name}}" }]),
        createdAt: Date.now(),
      });
    });

    const created = await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id name score stageId } }`, {
      i: { name: "GQL Deal", amount: 12000 },
    });
    expect(created.body.errors).toBeUndefined();
    const deal = created.body.data.createDeal as { id: string; name: string; score: number; stageId: string };
    expect(deal.name).toBe("GQL Deal");
    expect(typeof deal.score).toBe("number");

    const wonStageId = await withWorkspace(wsA, async () =>
      (await db.select().from(tables.stages).where(eq(tables.stages.type, "won")).limit(1))[0]?.id,
    );
    const moved = await run(ADMIN_A, `mutation ($id: ID!, $i: JSON!) { updateDeal(id: $id, input: $i) { stageId score closedAt } }`, {
      id: deal.id,
      i: { stageId: wonStageId },
    });
    expect(moved.body.errors).toBeUndefined();
    expect(moved.body.data.updateDeal.score).toBe(100);
    expect(moved.body.data.updateDeal.closedAt).toBeGreaterThan(0);

    await withWorkspace(wsA, async () => {
      const notes = (await db.select().from(tables.notes)).filter((n) => n.entityId === deal.id);
      expect(notes.some((n) => n.body === "won GQL Deal")).toBe(true);
    });

    const denied = await run(VIEWER_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Nope" },
    });
    expect(denied.body.errors?.[0].extensions.code).toBe("FORBIDDEN");

    const bad = await run(ADMIN_A, `mutation ($id: ID!, $i: JSON!) { updateDeal(id: $id, input: $i) { id } }`, {
      id: deal.id,
      i: { stageId: "does-not-exist" },
    });
    expect(bad.body.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");

    const deleted = await run(ADMIN_A, `mutation ($id: ID!) { deleteDeal(id: $id) }`, { id: deal.id });
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteDeal).toBe(true);
    const gone = await run(ADMIN_A, `query ($id: ID!) { deal(id: $id) { id } }`, { id: deal.id });
    expect(gone.body.data.deal).toBeNull();
  });

  it("lists deals filtered by company, matching REST/MCP", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Filter Co" },
    });
    const other = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Other Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const otherId = other.body.data.createCompany.id as string;
    await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "On Filter Co", companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "On Other Co", companyId: otherId },
    });

    const listed = await run(
      ADMIN_A,
      `query ($id: String) { deals(companyId: $id) { name companyId } }`,
      { id: companyId },
    );
    expect(listed.body.errors).toBeUndefined();
    const rows = listed.body.data.deals as { name: string; companyId: string }[];
    expect(rows.some((d) => d.name === "On Filter Co")).toBe(true);
    expect(rows.some((d) => d.name === "On Other Co")).toBe(false);
  });

  it("nests deal.company and deal.contact like contact.company", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Nested Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const person = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Nested", lastName: "Person", companyId },
    });
    const contactId = person.body.data.createContact.id as string;
    await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Colleague", lastName: "Person", companyId },
    });
    const created = await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Nested Deal", companyId, contactId },
    });
    const dealId = created.body.data.createDeal.id as string;

    const res = await run(
      ADMIN_A,
      `query ($id: ID!) { deal(id: $id) { company { name } contact { firstName } stage { name daysInStage } } }`,
      { id: dealId },
    );
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.deal).toMatchObject({
      company: { name: "Nested Co" },
      contact: { firstName: "Nested" },
    });
    const clock = res.body.data.deal.stage as { name: string; daysInStage: number };
    expect(clock.name).toBeTruthy();
    expect(clock.daysInStage).toBe(0);

    const fromCompany = await run(
      ADMIN_A,
      `query ($id: ID!) { company(id: $id) { contacts { firstName } deals { name } } }`,
      { id: companyId },
    );
    expect(fromCompany.body.errors).toBeUndefined();
    const people = fromCompany.body.data.company.contacts as { firstName: string }[];
    const deals = fromCompany.body.data.company.deals as { name: string }[];
    expect(people.some((p) => p.firstName === "Nested")).toBe(true);
    expect(deals.some((d) => d.name === "Nested Deal")).toBe(true);

    const fromContact = await run(
      ADMIN_A,
      `query ($id: ID!) { contact(id: $id) { deals { name } } }`,
      { id: contactId },
    );
    expect(fromContact.body.errors).toBeUndefined();
    expect((fromContact.body.data.contact.deals as { name: string }[]).some((d) => d.name === "Nested Deal")).toBe(true);

    const peers = await run(
      ADMIN_A,
      `query ($id: ID!) { contact(id: $id) { colleagues { firstName } } }`,
      { id: contactId },
    );
    expect(peers.body.errors).toBeUndefined();
    const names = (peers.body.data.contact.colleagues as { firstName: string }[]).map((p) => p.firstName);
    expect(names).toContain("Colleague");
    expect(names).not.toContain("Nested");
  });

  it("lists companies filtered by industry, matching REST/MCP", async () => {
    await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Helios Energy", industry: "energy" },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Kite Media", industry: "media" },
    });

    const listed = await run(ADMIN_A, `{ companies(industry: "energy") { name industry } }`);
    expect(listed.body.errors).toBeUndefined();
    const rows = listed.body.data.companies as { name: string; industry: string }[];
    expect(rows.some((c) => c.name === "Helios Energy")).toBe(true);
    expect(rows.some((c) => c.name === "Kite Media")).toBe(false);
  });

  it("creates, completes, and deletes a task", async () => {
    const contact = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Task", lastName: "Owner" },
    });
    const contactId = contact.body.data.createContact.id as string;

    const created = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id title completedAt ownerId } }`, {
      i: { title: "Call Ada", entityType: "contact", entityId: contactId },
    });
    expect(created.body.errors).toBeUndefined();
    const task = created.body.data.createTask as { id: string; title: string; completedAt: number | null };
    expect(task.title).toBe("Call Ada");
    expect(task.completedAt ?? null).toBeNull();

    const fetched = await run(ADMIN_A, `query ($id: ID!) { task(id: $id) { id title entityType entityId ownerId } }`, {
      id: task.id,
    });
    expect(fetched.body.errors).toBeUndefined();
    expect(fetched.body.data.task).toMatchObject({
      id: task.id,
      title: "Call Ada",
      entityType: "contact",
      entityId: contactId,
      ownerId: null,
    });

    const done = await run(ADMIN_A, `mutation ($id: ID!, $i: JSON!) { updateTask(id: $id, input: $i) { completedAt } }`, {
      id: task.id,
      i: { completed: true },
    });
    expect(done.body.errors).toBeUndefined();
    expect(done.body.data.updateTask.completedAt).toBeGreaterThan(0);

    const denied = await run(VIEWER_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Nope" },
    });
    expect(denied.body.errors?.[0].extensions.code).toBe("FORBIDDEN");

    const deleted = await run(ADMIN_A, `mutation ($id: ID!) { deleteTask(id: $id) }`, { id: task.id });
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteTask).toBe(true);
  });

  it("lists tasks filtered by record and state, matching REST/MCP", async () => {
    const a = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Ada" },
    });
    const b = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Bo" },
    });
    const aId = a.body.data.createContact.id as string;
    const bId = b.body.data.createContact.id as string;

    const onA = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id title } }`, {
      i: { title: "Only Ada", entityType: "contact", entityId: aId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Only Bo", entityType: "contact", entityId: bId },
    });
    expect(onA.body.errors).toBeUndefined();
    const taskA = onA.body.data.createTask as { id: string; title: string };

    const listed = await run(
      ADMIN_A,
      `query ($id: String) { tasks(entityType: "contact", entityId: $id) { title entityId } }`,
      { id: aId },
    );
    expect(listed.body.errors).toBeUndefined();
    const rows = listed.body.data.tasks as { title: string; entityId: string }[];
    expect(rows.some((t) => t.title === "Only Ada")).toBe(true);
    expect(rows.some((t) => t.title === "Only Bo")).toBe(false);

    await run(ADMIN_A, `mutation ($id: ID!, $i: JSON!) { updateTask(id: $id, input: $i) { id } }`, {
      id: taskA.id,
      i: { completed: true },
    });
    const open = await run(
      ADMIN_A,
      `query ($id: String) { tasks(entityType: "contact", entityId: $id, state: "open") { title } }`,
      { id: aId },
    );
    expect(open.body.data.tasks.some((t: { title: string }) => t.title === "Only Ada")).toBe(false);
    const done = await run(
      ADMIN_A,
      `query ($id: String) { tasks(entityType: "contact", entityId: $id, state: "done") { title } }`,
      { id: aId },
    );
    expect(done.body.data.tasks.some((t: { title: string }) => t.title === "Only Ada")).toBe(true);
  });

  it("nests task.contact company and deal like MCP get_task neighbours", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Task Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const person = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Pinned" },
    });
    const contactId = person.body.data.createContact.id as string;
    const deal = await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Pinned Deal", companyId },
    });
    const dealId = deal.body.data.createDeal.id as string;

    const onContact = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Call them", entityType: "contact", entityId: contactId },
    });
    const onCompany = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Visit HQ", entityType: "company", entityId: companyId },
    });
    const onDeal = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Follow up", entityType: "deal", entityId: dealId },
    });
    const loose = await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Inbox" },
    });
    expect(onContact.body.errors).toBeUndefined();

    const q = `query ($id: ID!) { task(id: $id) { contact { firstName } company { name } deal { name } record { data } } }`;
    const pinnedPerson = await run(ADMIN_A, q, { id: onContact.body.data.createTask.id });
    expect(pinnedPerson.body.errors).toBeUndefined();
    expect(pinnedPerson.body.data.task).toEqual({
      contact: { firstName: "Pinned" },
      company: null,
      deal: null,
      record: null,
    });

    const pinnedCo = await run(ADMIN_A, q, { id: onCompany.body.data.createTask.id });
    expect(pinnedCo.body.data.task).toEqual({
      contact: null,
      company: { name: "Task Co" },
      deal: null,
      record: null,
    });

    const pinnedDeal = await run(ADMIN_A, q, { id: onDeal.body.data.createTask.id });
    expect(pinnedDeal.body.data.task).toEqual({
      contact: null,
      company: null,
      deal: { name: "Pinned Deal" },
      record: null,
    });

    const inbox = await run(ADMIN_A, q, { id: loose.body.data.createTask.id });
    expect(inbox.body.data.task).toEqual({ contact: null, company: null, deal: null, record: null });
  });

  it("creates a note on a contact and lists it", async () => {
    const contact = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Note", lastName: "Owner" },
    });
    const contactId = contact.body.data.createContact.id as string;

    const created = await run(
      ADMIN_A,
      `mutation ($i: JSON!) { createNote(input: $i) { id body entityType entityId } }`,
      { i: { body: "Followed up by phone", entityType: "contact", entityId: contactId } },
    );
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createNote.body).toBe("Followed up by phone");
    expect(created.body.data.createNote.entityId).toBe(contactId);

    const listed = await run(ADMIN_A, `query ($id: String) { notes(entityType: "contact", entityId: $id) { body } }`, {
      id: contactId,
    });
    expect(listed.body.data.notes.some((n: { body: string }) => n.body === "Followed up by phone")).toBe(true);

    const denied = await run(VIEWER_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "Nope", entityType: "contact", entityId: contactId },
    });
    expect(denied.body.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("lists notes with limit, matching REST/MCP", async () => {
    const contact = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Limit", lastName: "Notes" },
    });
    const contactId = contact.body.data.createContact.id as string;
    for (const body of ["oldest", "middle", "newest"]) {
      const created = await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
        i: { body, entityType: "contact", entityId: contactId },
      });
      expect(created.body.errors).toBeUndefined();
    }

    const all = await run(
      ADMIN_A,
      `query ($id: String) { notes(entityType: "contact", entityId: $id) { body } }`,
      { id: contactId },
    );
    expect(all.body.errors).toBeUndefined();
    const allRows = all.body.data.notes as { body: string }[];
    expect(allRows).toHaveLength(3);

    const limited = await run(
      ADMIN_A,
      `query ($id: String) { notes(entityType: "contact", entityId: $id, limit: 1) { body } }`,
      { id: contactId },
    );
    expect(limited.body.errors).toBeUndefined();
    const rows = limited.body.data.notes as { body: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe(allRows[0].body);
  });

  it("nests note.contact company and deal like task pins", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Note Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const person = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Noted" },
    });
    const contactId = person.body.data.createContact.id as string;
    const deal = await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Noted Deal", companyId },
    });
    const dealId = deal.body.data.createDeal.id as string;

    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "on person", entityType: "contact", entityId: contactId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "on co", entityType: "company", entityId: companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "on deal", entityType: "deal", entityId: dealId },
    });

    const q = `query ($t: String, $id: String) { notes(entityType: $t, entityId: $id) { body contact { firstName } company { name } deal { name } record { data } } }`;
    const onPerson = await run(ADMIN_A, q, { t: "contact", id: contactId });
    expect(onPerson.body.errors).toBeUndefined();
    expect(onPerson.body.data.notes.some((n: { body: string; contact: { firstName: string } | null; company: unknown; deal: unknown; record: unknown }) => n.body === "on person" && n.contact?.firstName === "Noted" && n.company === null && n.deal === null && n.record === null)).toBe(true);

    const onCo = await run(ADMIN_A, q, { t: "company", id: companyId });
    expect(onCo.body.data.notes.some((n: { body: string; company: { name: string } | null }) => n.body === "on co" && n.company?.name === "Note Co")).toBe(true);

    const onDeal = await run(ADMIN_A, q, { t: "deal", id: dealId });
    expect(onDeal.body.data.notes.some((n: { body: string; deal: { name: string } | null }) => n.body === "on deal" && n.deal?.name === "Noted Deal")).toBe(true);
  });

  it("records, lists, and accepts a fact suggestion, matching REST/MCP", async () => {
    const contact = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id jobTitle } }`, {
      i: { firstName: "Fact", lastName: "Owner" },
    });
    expect(contact.body.errors).toBeUndefined();
    const contactId = contact.body.data.createContact.id as string;
    expect(contact.body.data.createContact.jobTitle).toBeFalsy();

    const recorded = await run(
      ADMIN_A,
      `mutation ($i: JSON!) { recordFact(input: $i) { ok applied reason fact { id field value band status } } }`,
      {
        i: {
          entityType: "contact",
          entityId: contactId,
          field: "job_title",
          value: "Head of Ops",
          evidence: [{ kind: "crm.signature-block", detail: "their signature on 14 July reads Head of Ops" }],
        },
      },
    );
    expect(recorded.body.errors).toBeUndefined();
    expect(recorded.body.data.recordFact.ok).toBe(true);
    expect(recorded.body.data.recordFact.applied).toBe(false);
    expect(recorded.body.data.recordFact.fact.band).toBe("PROBABLE");
    const factId = recorded.body.data.recordFact.fact.id as string;

    const listed = await run(
      ADMIN_A,
      `query ($id: ID) { factSuggestions(entityType: "contact", entityId: $id) { id field value status contact { firstName } company { name } deal { name } record { data } } }`,
      { id: contactId },
    );
    expect(listed.body.errors).toBeUndefined();
    const suggestion = (
      listed.body.data.factSuggestions as {
        id: string;
        contact: { firstName: string } | null;
        company: unknown;
        deal: unknown;
        record: unknown;
      }[]
    ).find((f) => f.id === factId);
    expect(suggestion).toMatchObject({
      contact: { firstName: "Fact" },
      company: null,
      deal: null,
      record: null,
    });

    const other = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Other" },
    });
    const otherId = other.body.data.createContact.id as string;
    const otherFact = await run(ADMIN_A, `mutation ($i: JSON!) { recordFact(input: $i) { fact { id } } }`, {
      i: {
        entityType: "contact",
        entityId: otherId,
        field: "job_title",
        value: "Elsewhere",
        evidence: [{ kind: "crm.signature-block", detail: "their signature on 14 July reads Elsewhere" }],
      },
    });
    expect(otherFact.body.errors).toBeUndefined();
    const otherFactId = otherFact.body.data.recordFact.fact.id as string;

    const fromContact = await run(
      ADMIN_A,
      `query ($id: ID!) { contact(id: $id) { facts { id field value } } }`,
      { id: contactId },
    );
    expect(fromContact.body.errors).toBeUndefined();
    const contactFacts = fromContact.body.data.contact.facts as { id: string; field: string }[];
    expect(contactFacts.some((f) => f.id === factId && f.field === "job_title")).toBe(true);
    expect(contactFacts.some((f) => f.id === otherFactId)).toBe(false);

    const decided = await run(
      ADMIN_A,
      `mutation ($id: ID!, $d: String!) { decideFact(id: $id, decision: $d) { ok reason fact { status } } }`,
      { id: factId, d: "accept" },
    );
    expect(decided.body.errors).toBeUndefined();
    expect(decided.body.data.decideFact.ok).toBe(true);
    expect(decided.body.data.decideFact.fact.status).toBe("APPLIED");

    const after = await run(ADMIN_A, `query ($id: ID!) { contact(id: $id) { jobTitle } }`, { id: contactId });
    expect(after.body.data.contact.jobTitle).toBe("Head of Ops");

    const denied = await run(VIEWER_A, `mutation ($i: JSON!) { recordFact(input: $i) { ok } }`, {
      i: {
        entityType: "contact",
        entityId: contactId,
        field: "job_title",
        value: "Nope",
        evidence: [{ kind: "crm.signature-block", detail: "nope" }],
      },
    });
    expect(denied.body.errors?.[0].extensions.code).toBe("FORBIDDEN");

    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Fact Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const onCo = await run(ADMIN_A, `mutation ($i: JSON!) { recordFact(input: $i) { fact { id } } }`, {
      i: {
        entityType: "company",
        entityId: companyId,
        field: "linkedin",
        value: "https://linkedin.com/company/fact-co",
        evidence: [{ kind: "crm.signature-block", detail: "the footer lists this LinkedIn" }],
      },
    });
    expect(onCo.body.errors).toBeUndefined();
    const coFactId = onCo.body.data.recordFact.fact.id as string;
    const nestedCo = await run(
      ADMIN_A,
      `query ($id: ID) { factSuggestions(entityType: "company", entityId: $id) { id contact { firstName } company { name } deal { name } record { data } } }`,
      { id: companyId },
    );
    expect(nestedCo.body.errors).toBeUndefined();
    expect(
      (
        nestedCo.body.data.factSuggestions as {
          id: string;
          contact: unknown;
          company: { name: string } | null;
          deal: unknown;
          record: unknown;
        }[]
      ).some(
        (f) => f.id === coFactId && f.company?.name === "Fact Co" && f.contact === null && f.deal === null && f.record === null,
      ),
    ).toBe(true);
    const fromCompany = await run(
      ADMIN_A,
      `query ($id: ID!) { company(id: $id) { facts { id field } } }`,
      { id: companyId },
    );
    expect(fromCompany.body.errors).toBeUndefined();
    expect((fromCompany.body.data.company.facts as { id: string }[]).some((f) => f.id === coFactId)).toBe(true);
  });

  it("logs a call on a contact timeline and lists it, matching REST/MCP", async () => {
    const contact = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Call", lastName: "Target" },
    });
    const contactId = contact.body.data.createContact.id as string;

    const logged = await run(
      ADMIN_A,
      `mutation ($i: JSON!) { logActivity(input: $i) { type entityId meta } }`,
      { i: { type: "call", entityType: "contact", entityId: contactId, note: "Intro call" } },
    );
    expect(logged.body.errors).toBeUndefined();
    expect(logged.body.data.logActivity).toMatchObject({
      type: "call",
      entityId: contactId,
      meta: { note: "Intro call" },
    });

    const listed = await run(
      ADMIN_A,
      `query ($id: String) { activities(entityType: "contact", entityId: $id) { type meta } }`,
      { id: contactId },
    );
    expect(listed.body.errors).toBeUndefined();
    const rows = listed.body.data.activities as { type: string; meta: { note?: string } }[];
    expect(rows.some((a) => a.type === "call" && a.meta.note === "Intro call")).toBe(true);
    expect(rows.some((a) => a.type === "created")).toBe(true);

    const unscoped = await run(ADMIN_A, `{ activities { type } }`);
    expect(unscoped.body.errors).toBeUndefined();
    expect(unscoped.body.data.activities).toEqual([]);

    const denied = await run(VIEWER_A, `mutation ($i: JSON!) { logActivity(input: $i) { id } }`, {
      i: { type: "call", entityType: "contact", entityId: contactId },
    });
    expect(denied.body.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("nests activity.contact company and deal like task pins", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Act Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const person = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Acted" },
    });
    const contactId = person.body.data.createContact.id as string;
    const deal = await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Acted Deal", companyId },
    });
    const dealId = deal.body.data.createDeal.id as string;

    await run(ADMIN_A, `mutation ($i: JSON!) { logActivity(input: $i) { id } }`, {
      i: { type: "call", entityType: "contact", entityId: contactId, note: "person call" },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { logActivity(input: $i) { id } }`, {
      i: { type: "email", entityType: "company", entityId: companyId, note: "co mail" },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { logActivity(input: $i) { id } }`, {
      i: { type: "meeting", entityType: "deal", entityId: dealId, note: "deal meet" },
    });

    const q = `query ($t: String, $id: String) { activities(entityType: $t, entityId: $id) { type meta contact { firstName } company { name } deal { name } record { data } } }`;
    const onPerson = await run(ADMIN_A, q, { t: "contact", id: contactId });
    expect(onPerson.body.errors).toBeUndefined();
    expect(
      (onPerson.body.data.activities as { type: string; contact: { firstName: string } | null; record: unknown }[]).some(
        (a) => a.type === "call" && a.contact?.firstName === "Acted" && a.record === null,
      ),
    ).toBe(true);

    const onCo = await run(ADMIN_A, q, { t: "company", id: companyId });
    expect(
      (onCo.body.data.activities as { type: string; company: { name: string } | null }[]).some(
        (a) => a.type === "email" && a.company?.name === "Act Co",
      ),
    ).toBe(true);

    const onDeal = await run(ADMIN_A, q, { t: "deal", id: dealId });
    expect(
      (onDeal.body.data.activities as { type: string; deal: { name: string } | null }[]).some(
        (a) => a.type === "meeting" && a.deal?.name === "Acted Deal",
      ),
    ).toBe(true);
  });

  it("nests tasks notes and activities on contact company and deal", async () => {
    const co = await run(ADMIN_A, `mutation ($i: JSON!) { createCompany(input: $i) { id } }`, {
      i: { name: "Child Co" },
    });
    const companyId = co.body.data.createCompany.id as string;
    const person = await run(ADMIN_A, `mutation ($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Child", companyId },
    });
    const contactId = person.body.data.createContact.id as string;
    const deal = await run(ADMIN_A, `mutation ($i: JSON!) { createDeal(input: $i) { id } }`, {
      i: { name: "Child Deal", companyId, contactId },
    });
    const dealId = deal.body.data.createDeal.id as string;

    await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Ping Child", entityType: "contact", entityId: contactId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "Note on Child", entityType: "contact", entityId: contactId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "HQ visit", entityType: "company", entityId: companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "Note on Co", entityType: "company", entityId: companyId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Deal follow-up", entityType: "deal", entityId: dealId },
    });
    await run(ADMIN_A, `mutation ($i: JSON!) { createNote(input: $i) { id } }`, {
      i: { body: "Note on Deal", entityType: "deal", entityId: dealId },
    });

    const children = `{ tasks { title } notes { body } activities { type } }`;
    const fromContact = await run(ADMIN_A, `query ($id: ID!) { contact(id: $id) ${children} }`, { id: contactId });
    expect(fromContact.body.errors).toBeUndefined();
    expect((fromContact.body.data.contact.tasks as { title: string }[]).some((t) => t.title === "Ping Child")).toBe(true);
    expect((fromContact.body.data.contact.notes as { body: string }[]).some((n) => n.body === "Note on Child")).toBe(true);
    expect((fromContact.body.data.contact.activities as { type: string }[]).some((a) => a.type === "created")).toBe(true);

    const fromCompany = await run(ADMIN_A, `query ($id: ID!) { company(id: $id) ${children} }`, { id: companyId });
    expect(fromCompany.body.errors).toBeUndefined();
    expect((fromCompany.body.data.company.tasks as { title: string }[]).some((t) => t.title === "HQ visit")).toBe(true);
    expect((fromCompany.body.data.company.notes as { body: string }[]).some((n) => n.body === "Note on Co")).toBe(true);

    const fromDeal = await run(ADMIN_A, `query ($id: ID!) { deal(id: $id) ${children} }`, { id: dealId });
    expect(fromDeal.body.errors).toBeUndefined();
    expect((fromDeal.body.data.deal.tasks as { title: string }[]).some((t) => t.title === "Deal follow-up")).toBe(true);
    expect((fromDeal.body.data.deal.notes as { body: string }[]).some((n) => n.body === "Note on Deal")).toBe(true);
  });
});
