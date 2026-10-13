import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import type { MailMessage } from "@/lib/mail";

/**
 * Phase 15 (D6): a member writes to a contact from the contact's page or from
 * a deal they are on. The mail leaves through the server's mail service under
 * the member's name, replies go to the member's own address, and the email is
 * written on the timelines it concerns.
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

describe("sending email from the CRM", () => {
  const KEY = "frty_email_admin";
  const sent: MailMessage[] = [];
  let ws: string;
  const users = { binh: "", viewer: "" };
  const ids = { lan: "", tech: "", hung: "", noMail: "", deal: "" };

  const req = (url: string, init: RequestInit & { key?: string } = {}) =>
    new Request(`http://localhost${url}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.key ? { Authorization: `Bearer ${init.key}` } : {}) },
    });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const as = async (userId: string) => {
    jar.clear();
    await (await import("@/lib/auth")).createSession(userId, ws);
  };
  const send = async (body: Record<string, unknown>, key?: string) => {
    const route = await import("@/app/api/email/route");
    return route.POST(req("/api/email", { method: "POST", body: JSON.stringify(body), key }));
  };
  const timeline = async (entityType: string, entityId: string) => {
    const route = await import("@/app/api/activities/route");
    const res = await route.GET(req(`/api/activities?entityType=${entityType}&entityId=${entityId}`, { key: KEY }));
    return ((await res.json()).activities as { type: string; meta: Record<string, unknown> }[]).filter((a) => a.type === "email");
  };
  const post = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    const res = await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body), key: KEY }));
    expect(res.status).toBe(201);
    return (await res.json()) as Record<string, { id: string }>;
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: auth.sha256(KEY), role: "admin", createdAt: Date.now(),
      }),
    );
    users.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    users.viewer = await auth.createUser("xem@team.test", "Người xem", "viewer-password-1");
    await db.insert(tables.workspaceMembers).values([
      { id: newId(), workspaceId: ws, userId: users.binh, role: "member", createdAt: Date.now() },
      { id: newId(), workspaceId: ws, userId: users.viewer, role: "viewer", createdAt: Date.now() },
    ]);
    ids.lan = (await post("contacts", { firstName: "Lan", lastName: "Trần", email: "lan@khach.test" })).contact.id;
    ids.tech = (await post("contacts", { firstName: "Hà", lastName: "Phạm", email: "ha@khach.test" })).contact.id;
    ids.hung = (await post("contacts", { firstName: "Hùng", lastName: "Lê", email: "hung@khac.test" })).contact.id;
    ids.noMail = (await post("contacts", { firstName: "Không", lastName: "Mail" })).contact.id;
    ids.deal = (await post("deals", { name: "Pin Fiesta", contactId: ids.lan })).deal.id;
    const contacts = await import("@/app/api/deals/[id]/contacts/route");
    await contacts.PUT(
      req(`/api/deals/${ids.deal}/contacts`, { method: "PUT", body: JSON.stringify({ contacts: [{ contactId: ids.tech, role: "Kỹ thuật" }] }), key: KEY }),
      params({ id: ids.deal }),
    );
  });

  beforeEach(async () => {
    sent.length = 0;
    (await import("@/lib/mail")).__setMailer({
      transport: "test",
      from: "Fourty CRM <crm@team.test>",
      send: async (m) => {
        sent.push(m);
      },
    });
    (await import("@/lib/ratelimit")).__resetRateLimits();
  });
  afterAll(async () => (await import("@/lib/mail")).__setMailer(undefined));

  it("sends from a contact's page under the member's name, with replies going to them", async () => {
    await as(users.binh);
    const res = await send({ entityType: "contact", entityId: ids.lan, contactId: ids.lan, subject: "Báo giá pin", body: "Chào chị Lan,\nEm gửi báo giá." });
    expect(res.status).toBe(200);
    expect(sent).toEqual([
      expect.objectContaining({
        to: "lan@khach.test",
        subject: "Báo giá pin",
        text: "Chào chị Lan,\nEm gửi báo giá.",
        replyTo: "binh@team.test",
        fromName: "DVHai",
      }),
    ]);
    const [entry] = await timeline("contact", ids.lan);
    expect(entry.meta).toMatchObject({ sent: true, subject: "Báo giá pin", to: "lan@khach.test" });
  });

  it("sends from a deal to anyone on it and writes it on both timelines", async () => {
    await as(users.binh);
    expect((await send({ entityType: "deal", entityId: ids.deal, contactId: ids.tech, subject: "Thông số", body: "Gửi anh Hà." })).status).toBe(200);
    expect(sent[0]?.to).toBe("ha@khach.test");
    expect((await timeline("deal", ids.deal)).map((a) => a.meta.subject)).toEqual(["Thông số"]);
    expect((await timeline("contact", ids.tech)).map((a) => a.meta.subject)).toEqual(["Thông số"]);
  });

  it("refuses someone who is not on the record, or who has no email", async () => {
    await as(users.binh);
    expect((await send({ entityType: "deal", entityId: ids.deal, contactId: ids.hung, subject: "x", body: "x" })).status).toBe(400);
    expect((await send({ entityType: "contact", entityId: ids.lan, contactId: ids.hung, subject: "x", body: "x" })).status).toBe(400);
    expect((await send({ entityType: "contact", entityId: ids.noMail, contactId: ids.noMail, subject: "x", body: "x" })).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("needs a signed-in member: not a viewer, not an API key", async () => {
    await as(users.viewer);
    expect((await send({ entityType: "contact", entityId: ids.lan, contactId: ids.lan, subject: "x", body: "x" })).status).toBe(403);
    jar.clear();
    expect((await send({ entityType: "contact", entityId: ids.lan, contactId: ids.lan, subject: "x", body: "x" }, KEY)).status).toBe(403);
    expect(sent).toEqual([]);
  });

  it("says so when this server cannot send mail", async () => {
    (await import("@/lib/mail")).__setMailer(null);
    await as(users.binh);
    const res = await send({ entityType: "contact", entityId: ids.lan, contactId: ids.lan, subject: "x", body: "x" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/mail/i);
  });

  it("slows a sender down after 30 emails in an hour", async () => {
    await as(users.binh);
    for (let i = 0; i < 30; i++) {
      expect((await send({ entityType: "contact", entityId: ids.lan, contactId: ids.lan, subject: `#${i}`, body: "x" })).status).toBe(200);
    }
    expect((await send({ entityType: "contact", entityId: ids.lan, contactId: ids.lan, subject: "#31", body: "x" })).status).toBe(429);
    expect(sent).toHaveLength(30);
  });
});
