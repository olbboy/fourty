import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Audit log (Gate B3): mutations write audit rows, the log is immutable even for
 * the app role (0004: REVOKE UPDATE/DELETE + DO-INSTEAD-NOTHING rules), and it
 * exports to CSV. Admin-only read is covered by rbac-matrix.test.ts.
 */
describe("audit log (immutable)", () => {
  const KEY = "frty_audit_admin";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contacts: typeof import("@/app/api/contacts/route");
  let auditRoute: typeof import("@/app/api/audit/route");
  let ws: string;

  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      ...init,
    });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contacts = await import("@/app/api/contacts/route");
    auditRoute = await import("@/app/api/audit/route");
    ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "admin",
      prefix: KEY.slice(0, 8),
      keyHash: sha256(KEY),
      role: "admin",
      createdAt: Date.now(),
    });
    // Generate an audited mutation.
    await contacts.POST(
      req("/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Audited" }) }),
    );
  });

  it("a mutation writes an audit row", async () => {
    const res = await auditRoute.GET(req("/api/audit"));
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries.some((e: { action: string }) => e.action === "contact.created")).toBe(true);
  });

  it("audit rows are immutable for the app role (update/delete rejected or no-op)", async () => {
    const before = await withWorkspace(ws, () => db.select().from(tables.auditLog));
    expect(before.length).toBeGreaterThan(0);

    await withWorkspace(ws, () => db.update(tables.auditLog).set({ action: "tampered" })).catch(
      () => {},
    );
    await withWorkspace(ws, () => db.delete(tables.auditLog)).catch(() => {});

    const after = await withWorkspace(ws, () => db.select().from(tables.auditLog));
    expect(after.length).toBe(before.length); // nothing deleted
    expect(after.every((r) => r.action !== "tampered")).toBe(true); // nothing rewritten
  });

  it("exports the audit log as CSV", async () => {
    const res = await auditRoute.GET(req("/api/audit?format=csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("contact.created");
  });
});
