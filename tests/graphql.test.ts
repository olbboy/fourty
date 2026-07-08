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

    // Missing required field → BAD_USER_INPUT
    const bad = await run(ADMIN_A, `mutation ($d: JSON!) { createRecord(object: "ticket", data: $d) { id } }`, {
      d: {},
    });
    expect(bad.body.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");

    const records = await run(ADMIN_A, `{ records(object: "ticket") { data } }`);
    expect(records.body.data.records.length).toBe(1);
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
      ]);
    });

    // Viewer's email is redacted to null; admin still reads it (bypass).
    const asViewer = await run(VIEWER_A, `{ contacts { firstName email } }`);
    expect(asViewer.body.errors).toBeUndefined();
    expect(asViewer.body.data.contacts.length).toBeGreaterThan(0);
    expect(asViewer.body.data.contacts.every((c: { email: unknown }) => c.email === null)).toBe(true);
    const asAdmin = await run(ADMIN_A, `{ contacts { email } }`);
    expect(asAdmin.body.data.contacts.some((c: { email: string }) => c.email === "ada@analytical.engine")).toBe(true);

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
});
