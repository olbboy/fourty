import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 28 (D19): an admin brings a removed member back in one step, with
 * their old role; each person writes their own job title and phone, which
 * the member list shows.
 */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

describe("members: reactivate, title and phone", () => {
  const KEY = "frty_member_profile";
  let ws: string;
  let binh = "";

  const req = (url: string, init: RequestInit = {}, key?: string) =>
    new Request(`http://localhost${url}`, { ...init, headers: { "content-type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const members = async () => {
    const route = await import("@/app/api/members/route");
    return (await (await route.GET(req("/api/members", {}, KEY))).json()).members as Record<string, unknown>[];
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: auth.sha256(KEY), role: "admin", createdAt: Date.now() }),
    );
    binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: ws, userId: binh, role: "member", createdAt: Date.now() });
  });

  it("lets a person write their own job title and phone, shown in the member list", async () => {
    jar.clear();
    await (await import("@/lib/auth")).createSession(binh, ws);
    const me = await import("@/app/api/me/route");
    const res = await me.PATCH(req("/api/me", { method: "PATCH", body: JSON.stringify({ title: "Trưởng phòng kinh doanh", phone: "0903 123 456" }) }));
    expect(res.status).toBe(200);
    expect((await members()).find((m) => m.userId === binh)).toMatchObject({ name: "DVHai", title: "Trưởng phòng kinh doanh", phone: "0903 123 456" });
  });

  it("brings a removed member back with their old role", async () => {
    const route = await import("@/app/api/members/[userId]/route");
    expect((await route.DELETE(req(`/api/members/${binh}`, { method: "DELETE" }, KEY), params({ userId: binh }))).status).toBe(200);
    expect((await members()).find((m) => m.userId === binh)?.deactivatedAt).not.toBeNull();

    const res = await route.PATCH(req(`/api/members/${binh}`, { method: "PATCH", body: JSON.stringify({ reactivate: true }) }, KEY), params({ userId: binh }));
    expect(res.status).toBe(200);
    expect((await members()).find((m) => m.userId === binh)).toMatchObject({ deactivatedAt: null, role: "member" });

    const audit = await import("@/app/api/audit/route");
    const entries = (await (await audit.GET(req("/api/audit?action=member.reactivated", {}, KEY))).json()).entries as unknown[];
    expect(entries).toHaveLength(1);
  });

  it("refuses to reactivate someone who is active, or never was a member", async () => {
    const route = await import("@/app/api/members/[userId]/route");
    expect((await route.PATCH(req(`/api/members/${binh}`, { method: "PATCH", body: JSON.stringify({ reactivate: true }) }, KEY), params({ userId: binh }))).status).toBe(400);
    expect((await route.PATCH(req(`/api/members/nobody`, { method: "PATCH", body: JSON.stringify({ reactivate: true }) }, KEY), params({ userId: "nobody" }))).status).toBe(404);
  });
});
