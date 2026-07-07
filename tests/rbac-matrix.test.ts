import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * RBAC matrix (Gate B3): drive the real route handlers as each workspace role
 * (admin / member / viewer, carried by an API key's `role`) and assert the
 * documented allow/deny. Read is open to any member; CRM writes need member+;
 * administration objects (api-keys, members, audit) are admin-only.
 */
describe("RBAC matrix", () => {
  const KEY = { admin: "frty_rbac_admin", member: "frty_rbac_member", viewer: "frty_rbac_viewer" };
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contacts: typeof import("@/app/api/contacts/route");
  let contactsId: typeof import("@/app/api/contacts/[id]/route");
  let apiKeys: typeof import("@/app/api/api-keys/route");
  let members: typeof import("@/app/api/members/route");
  let auditRoute: typeof import("@/app/api/audit/route");

  const req = (token: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...init,
    });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contacts = await import("@/app/api/contacts/route");
    contactsId = await import("@/app/api/contacts/[id]/route");
    apiKeys = await import("@/app/api/api-keys/route");
    members = await import("@/app/api/members/route");
    auditRoute = await import("@/app/api/audit/route");

    const ws = await createWorkspace();
    for (const role of ["admin", "member", "viewer"] as const) {
      await db.insert(tables.apiKeys).values({
        id: newId(),
        workspaceId: ws,
        name: role,
        prefix: KEY[role].slice(0, 8),
        keyHash: sha256(KEY[role]),
        role,
        createdAt: Date.now(),
      });
    }
  });

  async function seedContact(): Promise<string> {
    const res = await contacts.POST(
      req(KEY.admin, "/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Seed" }) }),
    );
    return (await res.json()).contact.id;
  }

  it("CRM read is open to every role", async () => {
    for (const role of ["admin", "member", "viewer"] as const) {
      const res = await contacts.GET(req(KEY[role], "/api/contacts"));
      expect(res.status, `${role} list`).toBe(200);
    }
  });

  it("CRM create: admin+member allowed, viewer forbidden (403)", async () => {
    const cases = [
      ["admin", 201],
      ["member", 201],
      ["viewer", 403],
    ] as const;
    for (const [role, expected] of cases) {
      const res = await contacts.POST(
        req(KEY[role], "/api/contacts", { method: "POST", body: JSON.stringify({ firstName: role }) }),
      );
      expect(res.status, `${role} create`).toBe(expected);
    }
  });

  it("CRM update/delete: viewer forbidden, member allowed", async () => {
    const id = await seedContact();
    const patch = (role: keyof typeof KEY) =>
      contactsId.PATCH(
        req(KEY[role], `/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ firstName: "X" }) }),
        { params: Promise.resolve({ id }) },
      );
    expect((await patch("viewer")).status, "viewer patch").toBe(403);
    expect((await patch("member")).status, "member patch").toBe(200);

    const del = (role: keyof typeof KEY) =>
      contactsId.DELETE(req(KEY[role], `/api/contacts/${id}`), { params: Promise.resolve({ id }) });
    expect((await del("viewer")).status, "viewer delete").toBe(403);
    expect((await del("admin")).status, "admin delete").toBe(200);
  });

  it("administration objects are admin-only", async () => {
    // api-keys list
    expect((await apiKeys.GET(req(KEY.viewer, "/api/api-keys"))).status, "viewer api-keys").toBe(403);
    expect((await apiKeys.GET(req(KEY.member, "/api/api-keys"))).status, "member api-keys").toBe(403);
    expect((await apiKeys.GET(req(KEY.admin, "/api/api-keys"))).status, "admin api-keys").toBe(200);
    // members list
    expect((await members.GET(req(KEY.member, "/api/members"))).status, "member members").toBe(403);
    expect((await members.GET(req(KEY.admin, "/api/members"))).status, "admin members").toBe(200);
    // audit log
    expect((await auditRoute.GET(req(KEY.viewer, "/api/audit"))).status, "viewer audit").toBe(403);
    expect((await auditRoute.GET(req(KEY.admin, "/api/audit"))).status, "admin audit").toBe(200);
  });
});
