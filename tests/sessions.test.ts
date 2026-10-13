import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 10 (D1): who signed in when, and on which devices. Everyone sees and
 * ends their own sessions; an admin of the instance owner's workspace can sign
 * a member out everywhere; the member list shows each last sign-in.
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

describe("sessions and last sign-in", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let auth: typeof import("@/lib/auth");
  let newId: typeof import("@/lib/id").newId;
  let owner: string;
  const ids = { anhlam: "", binh: "" };

  const call = async (
    route: Record<string, unknown>,
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: unknown,
    params?: Record<string, string>,
    headers: Record<string, string> = {},
  ) =>
    (route[method] as (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>)(
      new Request(`http://localhost${url}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      params ? { params: Promise.resolve(params) } : undefined,
    );
  /** Sign in through the real login route, from a given browser. */
  const signIn = async (email: string, password: string, userAgent: string) => {
    jar.clear();
    (await import("@/lib/ratelimit")).__resetRateLimits(); // many sign-ins from one test IP
    const login = await import("@/app/api/auth/login/route");
    const res = await call(login, "POST", "/api/auth/login", { email, password }, undefined, {
      "user-agent": userAgent,
      "x-forwarded-for": "203.0.113.7",
    });
    expect(res.status).toBe(200);
    return jar.get("fourty_session")!;
  };
  const mySessions = async () =>
    (await (await call(await import("@/app/api/me/sessions/route"), "GET", "/api/me/sessions")).json()).sessions as {
      id: string;
      userAgent: string | null;
      ip: string | null;
      lastSeenAt: number;
      current: boolean;
    }[];

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    auth = await import("@/lib/auth");
    ({ newId } = await import("@/lib/id"));
    owner = await createWorkspace();
    ids.anhlam = await auth.createUser("anhlam@team.test", "Anh Lâm", "admin-password-1", "admin");
    ids.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    await db.insert(tables.workspaceMembers).values([
      { id: newId(), workspaceId: owner, userId: ids.anhlam, role: "admin", createdAt: Date.now() },
      { id: newId(), workspaceId: owner, userId: ids.binh, role: "member", createdAt: Date.now() },
    ]);
  });

  it("records the device of each sign-in and lists your sessions, marking this one", async () => {
    await signIn("binh@team.test", "binh-password-1", "Phone Safari");
    await signIn("binh@team.test", "binh-password-1", "Laptop Chrome");
    const sessions = await mySessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.current)).toMatchObject({ userAgent: "Laptop Chrome", ip: "203.0.113.7" });
    expect(sessions.find((s) => !s.current)).toMatchObject({ userAgent: "Phone Safari" });
  });

  it("signs out one other device, then all the others, but not this one", async () => {
    const phone = await signIn("binh@team.test", "binh-password-1", "Tablet");
    await signIn("binh@team.test", "binh-password-1", "Desktop");
    const route = await import("@/app/api/me/sessions/[id]/route");
    const tablet = (await mySessions()).find((s) => s.userAgent === "Tablet")!;
    expect((await call(route, "DELETE", `/api/me/sessions/${tablet.id}`, undefined, { id: tablet.id })).status).toBe(200);
    expect((await mySessions()).some((s) => s.userAgent === "Tablet")).toBe(false);
    void phone;

    expect((await call(await import("@/app/api/me/sessions/route"), "DELETE", "/api/me/sessions")).status).toBe(200);
    const left = await mySessions();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ current: true, userAgent: "Desktop" });
  });

  it("drops your expired sessions when you sign in", async () => {
    await db.insert(tables.sessions).values({
      id: "expired-session", userId: ids.binh, workspaceId: owner, expiresAt: Date.now() - 1_000, createdAt: Date.now() - 31 * 86_400_000,
    });
    await signIn("binh@team.test", "binh-password-1", "Desktop");
    const stale = await db.select().from(tables.sessions).where(eq(tables.sessions.id, "expired-session"));
    expect(stale).toEqual([]);
  });

  it("refreshes when a session was last seen, at most every few minutes", async () => {
    await signIn("binh@team.test", "binh-password-1", "Desktop");
    const current = (await mySessions()).find((s) => s.current)!;
    await db.update(tables.sessions).set({ lastSeenAt: Date.now() - 3_600_000 }).where(eq(tables.sessions.id, current.id));
    expect(await auth.getSessionUser()).not.toBeNull();
    const seen = (await mySessions()).find((s) => s.current)!;
    expect(Date.now() - seen.lastSeenAt).toBeLessThan(60_000);
  });

  it("shows each member's last sign-in, and lets the owner's admin sign a member out everywhere", async () => {
    await signIn("binh@team.test", "binh-password-1", "Phone");
    await signIn("anhlam@team.test", "admin-password-1", "Admin laptop");
    const members = (await (await call(await import("@/app/api/members/route"), "GET", "/api/members")).json()).members as {
      userId: string;
      lastLoginAt: number | null;
    }[];
    expect(Date.now() - members.find((m) => m.userId === ids.binh)!.lastLoginAt!).toBeLessThan(60_000);

    const route = await import("@/app/api/members/[userId]/sessions/route");
    expect((await call(route, "DELETE", `/api/members/${ids.binh}/sessions`, undefined, { userId: ids.binh })).status).toBe(200);
    const binhSessions = await db.select().from(tables.sessions).where(eq(tables.sessions.userId, ids.binh));
    expect(binhSessions).toEqual([]);

    await signIn("binh@team.test", "binh-password-1", "Phone");
    expect((await call(route, "DELETE", `/api/members/${ids.anhlam}/sessions`, undefined, { userId: ids.anhlam })).status).toBe(403);
  });
});
