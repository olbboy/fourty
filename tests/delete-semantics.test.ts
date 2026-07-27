import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { handleMcpRequest } from "@/mcp/server";
import type { ToolContext } from "@/mcp/tools";

/**
 * Delete semantics must match across REST, GraphQL, and MCP.
 *
 * Deleting a contact or a company has to clean up the rows that point at it.
 * `notes` and `activities` use a polymorphic (entityType, entityId) key, so
 * Postgres cannot enforce this with ON DELETE CASCADE — the cascade lives in
 * application code and therefore has to be asserted per surface.
 *
 * The not-found response deliberately differs per surface and is pinned here so
 * a later consolidation does not "normalise" it away: REST answers 404, MCP
 * throws, GraphQL returns `false`.
 */
describe("delete semantics parity (REST / GraphQL / MCP)", () => {
  const TOKEN = "frty_delete_semantics_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contactIdRoutes: typeof import("@/app/api/contacts/[id]/route");
  let companyIdRoutes: typeof import("@/app/api/companies/[id]/route");
  let gql: typeof import("@/app/api/graphql/route");
  let ws: string;
  let mcpCtx: ToolContext;

  const headers = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

  const restDelete = (
    route: { DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> },
    path: string,
    id: string,
  ) =>
    route.DELETE(new Request(`http://localhost${path}/${id}`, { method: "DELETE", headers }), {
      params: Promise.resolve({ id }),
    });

  async function runGql(query: string, variables?: Record<string, unknown>) {
    const res = await gql.POST(
      new Request("http://localhost/api/graphql", {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
      }),
    );
    return (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, mcpCtx);
    const result = res!.result as { content: { text: string }[]; isError?: boolean };
    return {
      isError: result.isError ?? false,
      data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text),
    };
  }

  /** Insert a contact plus 2 notes + 2 activities pointing at it. */
  async function seedContact(): Promise<string> {
    return withWorkspace(ws, async () => {
      const id = newId();
      const now = Date.now();
      await db.insert(tables.contacts).values({ id, firstName: "Ada", lastName: "Lovelace", createdAt: now, updatedAt: now });
      await seedChildren("contact", id);
      return id;
    });
  }

  /**
   * Insert a company with a contact and a deal attached, plus 2 notes +
   * 2 activities pointing at the company.
   */
  async function seedCompany(): Promise<{ companyId: string; contactId: string; dealId: string }> {
    return withWorkspace(ws, async () => {
      const now = Date.now();
      const companyId = newId();
      const contactId = newId();
      const dealId = newId();
      await db.insert(tables.companies).values({ id: companyId, name: "Analytical Engines", createdAt: now, updatedAt: now });
      await db.insert(tables.contacts).values({ id: contactId, firstName: "Charles", lastName: "Babbage", companyId, createdAt: now, updatedAt: now });
      await db.insert(tables.deals).values({
        id: dealId,
        name: "Engine order",
        pipelineId: newId(),
        stageId: newId(),
        companyId,
        stageEnteredAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await seedChildren("company", companyId);
      return { companyId, contactId, dealId };
    });
  }

  async function seedChildren(entityType: string, entityId: string) {
    const now = Date.now();
    await db.insert(tables.notes).values([
      { id: newId(), body: "first", entityType, entityId, createdAt: now },
      { id: newId(), body: "second", entityType, entityId, createdAt: now },
    ]);
    await db.insert(tables.activities).values([
      { id: newId(), type: "note", entityType, entityId, createdAt: now },
      { id: newId(), type: "call", entityType, entityId, createdAt: now },
    ]);
  }

  /** Rows still pointing at a deleted entity — must be 0 on every surface. */
  const orphansOf = (entityId: string) =>
    withWorkspace(ws, async () => ({
      notes: (await db.select().from(tables.notes).where(eq(tables.notes.entityId, entityId))).length,
      activities: (await db.select().from(tables.activities).where(eq(tables.activities.entityId, entityId))).length,
    }));

  const danglingCompanyRefs = (companyId: string) =>
    withWorkspace(ws, async () => ({
      contacts: (await db.select().from(tables.contacts).where(eq(tables.contacts.companyId, companyId))).length,
      deals: (await db.select().from(tables.deals).where(eq(tables.deals.companyId, companyId))).length,
    }));

  const exists = (table: "contacts" | "companies", id: string) =>
    withWorkspace(ws, async () => (await db.select().from(tables[table]).where(eq(tables[table].id, id))).length > 0);

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contactIdRoutes = await import("@/app/api/contacts/[id]/route");
    companyIdRoutes = await import("@/app/api/companies/[id]/route");
    gql = await import("@/app/api/graphql/route");

    ws = await createWorkspace();
    mcpCtx = { workspaceId: ws, role: "admin", userId: null };
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      role: "admin",
      createdAt: Date.now(),
    });
  });

  // ── contact ───────────────────────────────────────────────────────────────

  it("REST delete contact removes its notes + activities", async () => {
    const id = await seedContact();
    const res = await restDelete(contactIdRoutes, "/api/contacts", id);
    expect(res.status).toBe(200);
    expect(await exists("contacts", id)).toBe(false);
    expect(await orphansOf(id)).toEqual({ notes: 0, activities: 0 });
  });

  it("MCP delete_contact removes its notes + activities", async () => {
    const id = await seedContact();
    const res = await callTool("delete_contact", { id, confirm: true });
    expect(res.isError).toBe(false);
    expect(res.data.deleted).toBe(true);
    expect(await exists("contacts", id)).toBe(false);
    expect(await orphansOf(id)).toEqual({ notes: 0, activities: 0 });
  });

  it("GraphQL deleteContact removes its notes + activities", async () => {
    const id = await seedContact();
    const body = await runGql(`mutation($id: ID!) { deleteContact(id: $id) }`, { id });
    expect(body.errors).toBeUndefined();
    expect(body.data?.deleteContact).toBe(true);
    expect(await exists("contacts", id)).toBe(false);
    expect(await orphansOf(id)).toEqual({ notes: 0, activities: 0 });
  });

  // ── company ───────────────────────────────────────────────────────────────

  it("REST delete company detaches contacts + deals and removes notes + activities", async () => {
    const { companyId } = await seedCompany();
    const res = await restDelete(companyIdRoutes, "/api/companies", companyId);
    expect(res.status).toBe(200);
    expect(await exists("companies", companyId)).toBe(false);
    expect(await danglingCompanyRefs(companyId)).toEqual({ contacts: 0, deals: 0 });
    expect(await orphansOf(companyId)).toEqual({ notes: 0, activities: 0 });
  });

  it("MCP delete_company detaches contacts + deals and removes notes + activities", async () => {
    const { companyId } = await seedCompany();
    const res = await callTool("delete_company", { id: companyId, confirm: true });
    expect(res.isError).toBe(false);
    expect(res.data.deleted).toBe(true);
    expect(await exists("companies", companyId)).toBe(false);
    expect(await danglingCompanyRefs(companyId)).toEqual({ contacts: 0, deals: 0 });
    expect(await orphansOf(companyId)).toEqual({ notes: 0, activities: 0 });
  });

  it("GraphQL deleteCompany detaches contacts + deals and removes notes + activities", async () => {
    const { companyId } = await seedCompany();
    const body = await runGql(`mutation($id: ID!) { deleteCompany(id: $id) }`, { id: companyId });
    expect(body.errors).toBeUndefined();
    expect(body.data?.deleteCompany).toBe(true);
    expect(await exists("companies", companyId)).toBe(false);
    expect(await danglingCompanyRefs(companyId)).toEqual({ contacts: 0, deals: 0 });
    expect(await orphansOf(companyId)).toEqual({ notes: 0, activities: 0 });
  });

  it("detaching a company leaves the contact and deal rows themselves intact", async () => {
    const { companyId, contactId, dealId } = await seedCompany();
    await runGql(`mutation($id: ID!) { deleteCompany(id: $id) }`, { id: companyId });
    const survivors = await withWorkspace(ws, async () => ({
      contact: (await db.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)))[0],
      deal: (await db.select().from(tables.deals).where(eq(tables.deals.id, dealId)))[0],
    }));
    expect(survivors.contact?.companyId).toBeNull();
    expect(survivors.deal?.companyId).toBeNull();
  });

  it("does not touch notes or activities belonging to a different entity", async () => {
    const keep = await seedContact();
    const doomed = await seedContact();
    await restDelete(contactIdRoutes, "/api/contacts", doomed);
    expect(await orphansOf(keep)).toEqual({ notes: 2, activities: 2 });
  });

  // ── not-found: deliberately different per surface ──────────────────────────

  it("REST answers 404 for an unknown id", async () => {
    expect((await restDelete(contactIdRoutes, "/api/contacts", "missing")).status).toBe(404);
    expect((await restDelete(companyIdRoutes, "/api/companies", "missing")).status).toBe(404);
  });

  it("MCP throws for an unknown id", async () => {
    expect((await callTool("delete_contact", { id: "missing", confirm: true })).isError).toBe(true);
    expect((await callTool("delete_company", { id: "missing", confirm: true })).isError).toBe(true);
  });

  it("GraphQL returns false for an unknown id (deliberate idiom, not an error)", async () => {
    const contact = await runGql(`mutation { deleteContact(id: "missing") }`);
    expect(contact.errors).toBeUndefined();
    expect(contact.data?.deleteContact).toBe(false);

    const company = await runGql(`mutation { deleteCompany(id: "missing") }`);
    expect(company.errors).toBeUndefined();
    expect(company.data?.deleteCompany).toBe(false);
  });

  it("MCP still dry-runs without confirm (deliberate, contact + company)", async () => {
    const id = await seedContact();
    const dry = await callTool("delete_contact", { id });
    expect(dry.data.dryRun).toBe(true);
    expect(await exists("contacts", id)).toBe(true);

    const { companyId } = await seedCompany();
    const dryCompany = await callTool("delete_company", { id: companyId });
    expect(dryCompany.data.dryRun).toBe(true);
    expect(await exists("companies", companyId)).toBe(true);
  });

  it("keeps notes scoped by workspace when counting orphans", async () => {
    // Guards the assertion helper itself: a stray row in another workspace must
    // not make an orphan check pass by accident.
    const other = await createWorkspace();
    const id = await seedContact();
    await withWorkspace(other, () =>
      db.insert(tables.notes).values({ id: newId(), body: "elsewhere", entityType: "contact", entityId: id, createdAt: Date.now() }),
    );
    await restDelete(contactIdRoutes, "/api/contacts", id);
    expect(await orphansOf(id)).toEqual({ notes: 0, activities: 0 });
    const strays = await withWorkspace(other, async () =>
      (await db.select().from(tables.notes).where(and(eq(tables.notes.entityId, id), eq(tables.notes.entityType, "contact")))).length,
    );
    expect(strays).toBe(1);
  });
});
