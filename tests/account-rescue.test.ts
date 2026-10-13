import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 8: everyone fixes their own name and password; an admin of the
 * instance owner's workspace (Q77) rescues a member's account without server
 * access: a new email, a one-time reset link to hand over, 2FA turned off.
 * Those three act on an Account shared by the whole instance, so a person must
 * be signed in to do them: an API key cannot.
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

describe("account self-service and rescue", () => {
  const KEY = "frty_account_rescue";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let auth: typeof import("@/lib/auth");
  let newId: typeof import("@/lib/id").newId;
  let owner: string;
  let later: string;
  const ids = { anhlam: "", binh: "", dai: "", stranger: "" };

  const call = async (
    route: Record<string, unknown>,
    method: "GET" | "PATCH" | "POST" | "DELETE",
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
  /** Sign in as someone, in a workspace: a fresh cookie jar holding one session. */
  const signIn = async (userId: string, workspaceId: string) => {
    jar.clear();
    return auth.createSession(userId, workspaceId);
  };
  const routes = {
    me: () => import("@/app/api/me/route"),
    password: () => import("@/app/api/me/password/route"),
    email: () => import("@/app/api/members/[userId]/email/route"),
    resetLink: () => import("@/app/api/members/[userId]/reset-link/route"),
    twoFactor: () => import("@/app/api/members/[userId]/2fa/route"),
    members: () => import("@/app/api/members/route"),
    audit: () => import("@/app/api/audit/route"),
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    auth = await import("@/lib/auth");
    ({ newId } = await import("@/lib/id"));
    owner = await createWorkspace();
    await new Promise((r) => setTimeout(r, 5)); // created strictly after the owner's
    later = await createWorkspace();

    ids.anhlam = await auth.createUser("anhlam@team.test", "Anh Lâm", "admin-password-1", "admin");
    ids.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    ids.dai = await auth.createUser("dai@team.test", "NVLong", "dai-password-1");
    ids.stranger = await auth.createUser("admin@other.test", "Other Admin", "other-password-1", "admin");
    await db.update(tables.users).set({ totpEnabled: 1, totpSecret: "SECRET" }).where(eq(tables.users.id, ids.binh));
    await db.insert(tables.workspaceMembers).values([
      { id: newId(), workspaceId: owner, userId: ids.anhlam, role: "admin", createdAt: Date.now() },
      { id: newId(), workspaceId: owner, userId: ids.binh, role: "member", createdAt: Date.now() },
      { id: newId(), workspaceId: owner, userId: ids.dai, role: "member", createdAt: Date.now() },
      { id: newId(), workspaceId: later, userId: ids.stranger, role: "admin", createdAt: Date.now() },
    ]);
    await withWorkspace(owner, () =>
      db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: owner, name: "admin", prefix: KEY.slice(0, 8), keyHash: auth.sha256(KEY), role: "admin", createdAt: Date.now(),
      }),
    );
  });

  it("lets anyone rename themselves", async () => {
    await signIn(ids.dai, owner);
    expect((await call(await routes.me(), "PATCH", "/api/me", { name: "NQ Đại" })).status).toBe(200);
    expect((await auth.getSessionUser())!.name).toBe("NQ Đại");
  });

  it("changes a password only with the current one, and signs out the other sessions", async () => {
    const phone = await signIn(ids.dai, owner);
    await signIn(ids.dai, owner); // the laptop, signed in now
    const route = await routes.password();
    const wrong = await call(route, "POST", "/api/me/password", { currentPassword: "nope-nope", newPassword: "dai-password-2" });
    expect(wrong.status).toBe(400);
    expect((await call(route, "POST", "/api/me/password", { currentPassword: "dai-password-1", newPassword: "dai-password-2" })).status).toBe(200);
    expect(await auth.getSessionUser()).not.toBeNull(); // still signed in here
    jar.clear();
    jar.set("fourty_session", phone);
    expect(await auth.getSessionUser()).toBeNull(); // the other device is out
  });

  it("gives the instance owner's admin a one-time reset link that lasts a day", async () => {
    await signIn(ids.anhlam, owner);
    const res = await call(await routes.resetLink(), "POST", `/api/members/${ids.binh}/reset-link`, {}, { userId: ids.binh });
    expect(res.status).toBe(201);
    const { url, expiresAt } = (await res.json()) as { url: string; expiresAt: number };
    expect(expiresAt - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
    expect(expiresAt - Date.now()).toBeLessThan(24.1 * 3_600_000);
    const token = new URL(url).searchParams.get("token")!;
    const { consumePasswordReset } = await import("@/lib/password-reset");
    expect(await consumePasswordReset(token, "binh-password-2")).toBe(true);
    expect(await consumePasswordReset(token, "binh-password-3")).toBe(false);
  });

  it("changes a member's email, refusing one another account uses", async () => {
    await signIn(ids.anhlam, owner);
    const route = await routes.email();
    expect((await call(route, "PATCH", `/api/members/${ids.binh}/email`, { email: "HaiDV@team.test" }, { userId: ids.binh })).status).toBe(200);
    const taken = await call(route, "PATCH", `/api/members/${ids.binh}/email`, { email: "dai@team.test" }, { userId: ids.binh });
    expect(taken.status).toBe(409);
    const list = (await (await call(await routes.members(), "GET", "/api/members")).json()) as { members: { userId: string; email: string }[] };
    expect(list.members.find((m) => m.userId === ids.binh)!.email).toBe("haidv@team.test");
  });

  it("turns off a member's two-factor sign-in", async () => {
    await signIn(ids.anhlam, owner);
    const members = await routes.members();
    const before = (await (await call(members, "GET", "/api/members")).json()) as { members: { userId: string; twoFactor: boolean }[] };
    expect(before.members.find((m) => m.userId === ids.binh)!.twoFactor).toBe(true);
    expect((await call(await routes.twoFactor(), "DELETE", `/api/members/${ids.binh}/2fa`, undefined, { userId: ids.binh })).status).toBe(200);
    const after = (await (await call(members, "GET", "/api/members")).json()) as { members: { userId: string; twoFactor: boolean }[] };
    expect(after.members.find((m) => m.userId === ids.binh)!.twoFactor).toBe(false);
  });

  it("records each rescue in the audit log", async () => {
    await signIn(ids.anhlam, owner);
    const { entries } = (await (await call(await routes.audit(), "GET", "/api/audit")).json()) as { entries: { action: string }[] };
    const actions = entries.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["member.reset_link_created", "member.email_changed", "member.2fa_disabled"]));
  });

  it("refuses a later workspace's admin, a member, and an API key", async () => {
    const resetLink = await routes.resetLink();
    const attempt = (headers: Record<string, string> = {}) =>
      call(resetLink, "POST", `/api/members/${ids.dai}/reset-link`, {}, { userId: ids.dai }, headers);
    await signIn(ids.stranger, later);
    expect((await attempt()).status).toBe(403);
    await signIn(ids.binh, owner);
    expect((await attempt()).status).toBe(403);
    jar.clear();
    expect((await attempt({ Authorization: `Bearer ${KEY}` })).status).toBe(403);
  });
});
