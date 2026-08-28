import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { __setMailer, type MailMessage } from "@/lib/mail";

/**
 * Workspace member management (Gate B3): list, invite, change role, and the
 * last-admin guard, driven through the real handlers with an admin API key.
 * The session-based accept flow is covered by the live E2E (it needs a cookie).
 */
describe("workspace members + invites", () => {
  const KEY = "frty_members_admin";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let membersRoute: typeof import("@/app/api/members/route");
  let memberIdRoute: typeof import("@/app/api/members/[userId]/route");
  let inviteRoute: typeof import("@/app/api/members/invite/route");
  let ws: string;
  let adminUser: string;
  let memberUser: string;

  afterEach(() => __setMailer(undefined));

  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      ...init,
    });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    membersRoute = await import("@/app/api/members/route");
    memberIdRoute = await import("@/app/api/members/[userId]/route");
    inviteRoute = await import("@/app/api/members/invite/route");

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

    adminUser = newId();
    memberUser = newId();
    await db.insert(tables.users).values([
      { id: adminUser, email: `a-${adminUser}@t.dev`, name: "Admin U", passwordHash: "s:h", role: "admin", createdAt: Date.now() },
      { id: memberUser, email: `m-${memberUser}@t.dev`, name: "Member U", passwordHash: "s:h", role: "member", createdAt: Date.now() },
    ]);
    await db.insert(tables.workspaceMembers).values([
      { id: newId(), workspaceId: ws, userId: adminUser, role: "admin", createdAt: Date.now() },
      { id: newId(), workspaceId: ws, userId: memberUser, role: "member", createdAt: Date.now() },
    ]);
  });

  it("lists the workspace's members", async () => {
    const res = await membersRoute.GET(req("/api/members"));
    expect(res.status).toBe(200);
    const { members } = await res.json();
    expect(members.length).toBe(2);
  });

  it("creates an invite whose token embeds the workspace", async () => {
    const res = await inviteRoute.POST(
      req("/api/members/invite", { method: "POST", body: JSON.stringify({ email: "new@t.dev", role: "member" }) }),
    );
    expect(res.status).toBe(201);
    const { token } = await res.json();
    expect(token.startsWith(`${ws}.`)).toBe(true);
  });

  it("reports emailed:false and sends nothing when SMTP is unconfigured", async () => {
    __setMailer(null); // force "mail disabled" regardless of ambient env
    const res = await inviteRoute.POST(
      req("/api/members/invite", { method: "POST", body: JSON.stringify({ email: "nomail@t.dev" }) }),
    );
    expect(res.status).toBe(201);
    // The token still comes back, so an operator without mail can hand it over.
    const { emailed, token } = await res.json();
    expect(emailed).toBe(false);
    expect(token).toBeTruthy();
  });

  it("emails an accept link carrying the invite token", async () => {
    const sent: MailMessage[] = [];
    __setMailer({
      transport: "smtp:test",
      from: "crm@t.dev",
      send: async (m) => {
        sent.push(m);
      },
    });

    const res = await inviteRoute.POST(
      req("/api/members/invite", { method: "POST", body: JSON.stringify({ email: "invited@t.dev", role: "viewer" }) }),
    );
    expect(res.status).toBe(201);
    const { emailed, token } = await res.json();
    expect(emailed).toBe(true);

    // QUEUE_DRIVER is inline under test, so the mail job has already run.
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe("invited@t.dev");
    // The link must be usable as-is: full origin, /accept, and the live token.
    expect(sent[0].text).toContain(`http://localhost/accept?token=${encodeURIComponent(token)}`);
    expect(sent[0].html).toContain("/accept?token=");
  });

  it("still issues the invite when the mail transport fails", async () => {
    __setMailer({
      transport: "smtp:test",
      from: "crm@t.dev",
      send: async () => {
        throw new Error("smtp unreachable");
      },
    });
    const res = await inviteRoute.POST(
      req("/api/members/invite", { method: "POST", body: JSON.stringify({ email: "broken@t.dev" }) }),
    );
    // The invite row is committed before the send, so a dead mail server must
    // not turn into a failed request — it degrades to emailed:false.
    expect(res.status).toBe(201);
    const { emailed, token } = await res.json();
    expect(emailed).toBe(false);
    expect(token.startsWith(`${ws}.`)).toBe(true);
  });

  it("changes a member's role", async () => {
    const res = await memberIdRoute.PATCH(
      req(`/api/members/${memberUser}`, { method: "PATCH", body: JSON.stringify({ role: "viewer" }) }),
      { params: Promise.resolve({ userId: memberUser }) },
    );
    expect(res.status).toBe(200);
  });

  it("refuses to demote the last admin", async () => {
    const res = await memberIdRoute.PATCH(
      req(`/api/members/${adminUser}`, { method: "PATCH", body: JSON.stringify({ role: "member" }) }),
      { params: Promise.resolve({ userId: adminUser }) },
    );
    expect(res.status).toBe(400);
  });

  it("refuses to remove the last admin", async () => {
    const res = await memberIdRoute.DELETE(req(`/api/members/${adminUser}`), {
      params: Promise.resolve({ userId: adminUser }),
    });
    expect(res.status).toBe(400);
  });

  it("deactivates a non-admin member", async () => {
    const res = await memberIdRoute.DELETE(req(`/api/members/${memberUser}`), {
      params: Promise.resolve({ userId: memberUser }),
    });
    expect(res.status).toBe(200);
  });
});
