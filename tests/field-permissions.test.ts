import { beforeAll, describe, expect, it } from "vitest";
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
  let fieldPerms: typeof import("@/app/api/field-permissions/route");

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
    fieldPerms = await import("@/app/api/field-permissions/route");

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
        body: JSON.stringify({ firstName: "Ada", email: "ada@x.io", status: "qualified" }),
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

  it("rules are confined to their workspace (RLS)", async () => {
    // Workspace B has no rules → its admin sees an unrestricted, empty rule set.
    const asB = await fieldPerms.GET(req(KEY_B, "/api/field-permissions"));
    expect((await asB.json()).rules).toHaveLength(0);
  });
});
