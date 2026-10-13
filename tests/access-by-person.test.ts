import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 11 (D2): API keys and connected mailboxes remember who made them, and
 * removing a member can take theirs back in the same step.
 */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => {
      jar.set(k, v);
    },
    delete: (k: string) => {
      jar.delete(k);
    },
  }),
}));

describe("keys and mailboxes by person", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let auth: typeof import("@/lib/auth");
  let ws: string;
  const ids = { anhlam: "", bac: "", binh: "" };

  const call = async (
    route: Record<string, unknown>,
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: unknown,
    params?: Record<string, string>,
  ) =>
    (route[method] as (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>)(
      new Request(`http://localhost${url}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      params ? { params: Promise.resolve(params) } : undefined,
    );
  const as = async (userId: string) => {
    jar.clear();
    await auth.createSession(userId, ws);
  };
  /** BTDuc makes a key and connects a calendar feed, as himself. */
  const bacMakesAccess = async () => {
    await as(ids.bac);
    const key = await call(await import("@/app/api/api-keys/route"), "POST", "/api/api-keys", { name: "Bac script" });
    const feed = await call(await import("@/app/api/sync/accounts/route"), "POST", "/api/sync/accounts", {
      provider: "ics", email: "bac@team.test", config: {},
    });
    return { key: (await key.json()).id as string, feed: (await feed.json()).account.id as string, keyStatus: key.status, feedStatus: feed.status };
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    ids.anhlam = await auth.createUser("anhlam@team.test", "Anh Lâm", "admin-password-1", "admin");
    ids.bac = await auth.createUser("bac@team.test", "BTDuc", "bac-password-1", "admin");
    ids.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    await db.insert(tables.workspaceMembers).values([
      { id: newId(), workspaceId: ws, userId: ids.anhlam, role: "admin", createdAt: Date.now() },
      { id: newId(), workspaceId: ws, userId: ids.bac, role: "admin", createdAt: Date.now() },
      { id: newId(), workspaceId: ws, userId: ids.binh, role: "member", createdAt: Date.now() },
    ]);
  });

  it("records who made an API key and who connected a mailbox", async () => {
    const made = await bacMakesAccess();
    expect([made.keyStatus, made.feedStatus]).toEqual([201, 201]);
    await as(ids.anhlam);
    const keys = (await (await call(await import("@/app/api/api-keys/route"), "GET", "/api/api-keys")).json()).keys as {
      id: string;
      createdBy: string | null;
    }[];
    expect(keys.find((k) => k.id === made.key)!.createdBy).toBe(ids.bac);
    const feeds = (await (await call(await import("@/app/api/sync/accounts/route"), "GET", "/api/sync/accounts")).json()).accounts as {
      id: string;
      createdBy: string | null;
    }[];
    expect(feeds.find((f) => f.id === made.feed)!.createdBy).toBe(ids.bac);
  });

  it("removes a member and, when asked, revokes their keys and disconnects their mailboxes", async () => {
    await as(ids.anhlam);
    const members = await import("@/app/api/members/route");
    const before = (await (await call(members, "GET", "/api/members")).json()).members as {
      userId: string;
      access: { keys: number; mailboxes: number };
    }[];
    expect(before.find((m) => m.userId === ids.bac)!.access).toEqual({ keys: 1, mailboxes: 1 });

    const remove = await import("@/app/api/members/[userId]/route");
    const res = await call(remove, "DELETE", `/api/members/${ids.bac}?revokeAccess=1`, undefined, { userId: ids.bac });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revokedKeys: 1, disconnectedMailboxes: 1 });
    await withWorkspace(ws, async () => {
      const keys = await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.createdBy, ids.bac));
      expect(keys.every((k) => k.revokedAt !== null)).toBe(true);
      expect(await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.createdBy, ids.bac))).toEqual([]);
    });
  });

  it("leaves a member's keys alone when removal does not ask to revoke them", async () => {
    await as(ids.anhlam);
    const { newId } = await import("@/lib/id");
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: ws, name: "Binh export", prefix: "frty_bin", keyHash: auth.sha256("frty_binh_key"), role: "member", createdBy: ids.binh, createdAt: Date.now(),
      }),
    );
    const remove = await import("@/app/api/members/[userId]/route");
    expect((await call(remove, "DELETE", `/api/members/${ids.binh}`, undefined, { userId: ids.binh })).status).toBe(200);
    await withWorkspace(ws, async () => {
      const keys = await db.select().from(tables.apiKeys).where(eq(tables.apiKeys.createdBy, ids.binh));
      expect(keys.map((k) => k.revokedAt)).toEqual([null]);
    });
  });
});
