import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 30 (D21): an email synced from a mailbox lands on the contact's
 * timeline and on every open deal the contact is on, as primary contact or as
 * a Deal contact; closed deals and other deals are left alone.
 */
describe("synced email on deals", () => {
  const KEY = "frty_sync_deals";
  let ws: string;
  const ids: Record<string, string> = {};

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const post = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    return Object.values(await (await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }))).json())[0] as { id: string };
  };
  const emailsOn = async (dealId: string) => {
    const route = await import("@/app/api/activities/route");
    const entries = (await (await route.GET(req(`/api/activities?entityType=deal&entityId=${dealId}`))).json()).activities as { type: string; meta: Record<string, unknown> }[];
    return entries.filter((a) => a.type === "email").map((a) => a.meta.subject);
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: sha256(KEY), role: "admin", createdAt: Date.now() }),
    );
    const pipelines = await import("@/app/api/pipelines/route");
    const stages = (await (await pipelines.GET(req("/api/pipelines"))).json()).pipelines[0].stages as { id: string; type: string }[];
    ids.alice = (await post("contacts", { firstName: "Alice", email: "alice@example.com" })).id;
    ids.primary = (await post("deals", { name: "Primary", contactId: ids.alice })).id;
    ids.participant = (await post("deals", { name: "Participant" })).id;
    ids.won = (await post("deals", { name: "Won", contactId: ids.alice, stageId: stages.find((s) => s.type === "won")!.id })).id;
    ids.other = (await post("deals", { name: "Other" })).id;
    const roles = await import("@/app/api/deals/[id]/contacts/route");
    await roles.PUT(req(`/api/deals/${ids.participant}/contacts`, { method: "PUT", body: JSON.stringify({ contacts: [{ contactId: ids.alice, role: "Kỹ thuật" }] }) }), params({ id: ids.participant }));
    const accounts = await import("@/app/api/sync/accounts/route");
    const res = await accounts.POST(
      req("/api/sync/accounts", { method: "POST", body: JSON.stringify({ provider: "imap", email: "me@myco.com", config: { host: "imap.myco.com", password: "secret" } }) }),
    );
    ids.account = (await res.json()).account.id;
  });

  it("puts the email on the open deals the contact is on, and nowhere else", async () => {
    const eml = [
      "Message-ID: <deal-timeline@mail.example.com>",
      "From: Alice <alice@example.com>",
      "To: Me <me@myco.com>",
      "Subject: Báo giá pin",
      "Date: Wed, 08 Jul 2026 10:00:00 +0000",
      "",
      "Gửi anh báo giá.",
    ].join("\n");
    const ingest = await import("@/app/api/sync/accounts/[id]/ingest/route");
    const res = await ingest.POST(req(`/api/sync/accounts/${ids.account}/ingest`, { method: "POST", body: JSON.stringify({ messages: [eml] }) }), params({ id: ids.account }));
    expect(res.status).toBe(200);
    expect(await emailsOn(ids.primary)).toEqual(["Báo giá pin"]);
    expect(await emailsOn(ids.participant)).toEqual(["Báo giá pin"]);
    expect(await emailsOn(ids.won)).toEqual([]);
    expect(await emailsOn(ids.other)).toEqual([]);
  });
});
