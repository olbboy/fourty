import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Q94, closing the gap ADR-017 left open: the work a write asks for (a
 * workflow, a webhook, an email) waits for that write to commit. A write that
 * is taken back, whole or in one savepoint, sends nothing.
 */
describe("jobs wait for the write that asked for them", () => {
  const ADMIN = "frty_after_commit_admin";
  const MEMBER = "frty_after_commit_member";
  let ws: string;

  const req = (url: string, key: string, init: RequestInit = {}, type = "application/json") =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": type } });

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values(
        [
          [ADMIN, "admin"],
          [MEMBER, "member"],
        ].map(([key, role]) => ({ id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now() })),
      ),
    );
    const pipelines = await import("@/app/api/pipelines/route");
    expect((await pipelines.POST(req("/api/pipelines", ADMIN, { method: "POST", body: JSON.stringify({ name: "Bán hàng" }) }))).status).toBe(201);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs a held job once the transaction commits, and drops it when the transaction or its savepoint is rolled back", async () => {
    const { withWorkspace, withSavepoint, deferUntilCommit } = await import("@/db");
    const done: string[] = [];
    const job = (name: string) => async () => {
      done.push(name);
    };

    await withWorkspace(ws, async () => {
      expect(deferUntilCommit(job("kept"))).toBe(true);
      await withSavepoint(async () => {
        deferUntilCommit(job("taken back with its savepoint"));
        throw new Error("refused");
      }).catch(() => undefined);
      expect(done).toEqual([]);
    });
    expect(done).toEqual(["kept"]);

    await withWorkspace(ws, async () => {
      deferUntilCommit(job("taken back with its transaction"));
      throw new Error("refused");
    }).catch(() => undefined);
    expect(done).toEqual(["kept"]);

    // Outside a transaction there is nothing to wait for: the caller runs it.
    expect(deferUntilCommit(job("now"))).toBe(false);
  });

  it("sends no webhook for a deal an import took back, and one for a deal it kept", async () => {
    const posted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        posted.push(String(url));
        return new Response("ok");
      }),
    );
    const workflows = await import("@/app/api/workflows/route");
    const created = await workflows.POST(
      req("/api/workflows", ADMIN, {
        method: "POST",
        body: JSON.stringify({ name: "Báo hệ thống kế toán", trigger: { event: "deal.created" }, actions: [{ type: "webhook", url: "https://93.184.216.34/hook" }] }),
      }),
    );
    expect(created.status).toBe(201);
    const perms = await import("@/app/api/field-permissions/route");
    await perms.POST(req("/api/field-permissions", ADMIN, { method: "POST", body: JSON.stringify({ object: "deals", field: "amount", role: "member", canRead: true, canWrite: false }) }));

    const route = await import("@/app/api/import/deals/route");
    const header = "Tên deal,Giá trị";
    // The second row is refused once the first deal is already written.
    const refused = await route.POST(req("/api/import/deals", MEMBER, { method: "POST", body: [header, "Trước,", `Sau,"1.000.000"`].join("\n") }, "text/csv"));
    expect(refused.status).toBe(403);
    expect(posted).toEqual([]);

    const kept = await route.POST(req("/api/import/deals", ADMIN, { method: "POST", body: [header, "Giữ lại,"].join("\n") }, "text/csv"));
    expect(kept.status).toBe(200);
    expect(posted).toEqual(["https://93.184.216.34/hook"]);
  });
});
