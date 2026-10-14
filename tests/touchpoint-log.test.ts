import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 19 (D10): a call, meeting or email logged by hand carries what was
 * said, when it happened and how long it took; the timeline places it at the
 * time it happened, not the time it was typed in.
 */
describe("logging a touchpoint", () => {
  const KEY = "frty_touchpoint";
  let contactId = "";
  let ws: string;

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const log = async (body: Record<string, unknown>) => {
    const route = await import("@/app/api/activities/route");
    return route.POST(req("/api/activities", { method: "POST", body: JSON.stringify({ entityType: "contact", entityId: contactId, ...body }) }));
  };
  const timeline = async () => {
    const route = await import("@/app/api/activities/route");
    return (await (await route.GET(req(`/api/activities?entityType=contact&entityId=${contactId}`))).json()).activities as {
      type: string;
      createdAt: number;
      meta: Record<string, unknown>;
    }[];
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
    const contacts = await import("@/app/api/contacts/route");
    const res = await contacts.POST(req("/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Khôi", lastName: "Đỗ" }) }));
    contactId = (await res.json()).contact.id;
  });

  it("keeps what was said, when, and for how long, and dates the contact's last activity by it", async () => {
    const yesterday = Date.now() - 86_400_000;
    const res = await log({ type: "call", note: "Hỏi giá 4 bộ pin", occurredAt: yesterday, durationMinutes: 15 });
    expect(res.status).toBe(201);
    const call = (await timeline()).find((a) => a.type === "call")!;
    expect(call.createdAt).toBe(yesterday);
    expect(call.meta).toMatchObject({ note: "Hỏi giá 4 bộ pin", durationMinutes: 15 });

    const contacts = await import("@/app/api/contacts/[id]/route");
    const contact = (await (await contacts.GET(req(`/api/contacts/${contactId}`), { params: Promise.resolve({ id: contactId }) })).json()).contact;
    expect(contact.lastActivityAt).toBeGreaterThanOrEqual(yesterday);
  });

  it("places a meeting from last week below what happened since", async () => {
    const lastWeek = Date.now() - 7 * 86_400_000;
    expect((await log({ type: "meeting", occurredAt: lastWeek, durationMinutes: 60 })).status).toBe(201);
    const types = (await timeline()).map((a) => a.type);
    expect(types.indexOf("meeting")).toBeGreaterThan(types.indexOf("call"));
  });

  it("refuses a time more than a day ahead, or a length of zero", async () => {
    expect((await log({ type: "call", occurredAt: Date.now() + 2 * 86_400_000 })).status).toBe(400);
    expect((await log({ type: "call", durationMinutes: 0 })).status).toBe(400);
  });
});
