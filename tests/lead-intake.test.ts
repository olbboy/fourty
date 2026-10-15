import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Q104: leads pushed from another system with `POST /api/contacts?ifExists=fill`.
 * A new email makes a contact; an email already known fills only that
 * contact's empty fields (what the CRM knows wins over a form), never lowers
 * its status, and notes on its timeline that the lead came back.
 */
describe("lead intake: create, or fill the contact that has this email", () => {
  const MEMBER = "frty_intake_member";
  const VIEWER = "frty_intake_viewer";
  const ADMIN = "frty_intake_admin";
  let ws: string;
  let binh = "";

  const req = (url: string, key: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const push = async (body: Record<string, unknown>, key = MEMBER, query = "?ifExists=fill") => {
    const route = await import("@/app/api/contacts/route");
    const res = await route.POST(req(`/api/contacts${query}`, key, { method: "POST", body: JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as { contact?: Record<string, unknown>; existed?: boolean; error?: string } };
  };
  const timeline = async (id: string) => {
    const route = await import("@/app/api/activities/route");
    return (await (await route.GET(req(`/api/activities?entityType=contact&entityId=${id}`, ADMIN))).json()).activities as { type: string; meta: Record<string, unknown> }[];
  };

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
          [VIEWER, "viewer"],
        ].map(([key, role]) => ({ id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now() })),
      ),
    );
    binh = await (await import("@/lib/auth")).createUser("binh@team.test", "DVHai", "binh-password-1");
    await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: ws, userId: binh, role: "member", createdAt: Date.now() });
    // One follow-up task per new lead (Q105), so a lead coming back must not make another.
    const workflows = await import("@/app/api/workflows/route");
    await workflows.POST(
      req("/api/workflows", ADMIN, {
        method: "POST",
        body: JSON.stringify({ name: "Gọi lại lead mới", trigger: { event: "contact.created" }, actions: [{ type: "create_task", title: "Gọi lại lead {{firstName}}", dueInDays: 1 }] }),
      }),
    );
  });

  it("makes a new lead from an email it has not seen", async () => {
    const { status, body } = await push({ firstName: "Khôi", email: "khoi@khach.test", source: "website" });
    expect(status).toBe(201);
    expect(body.existed).toBe(false);
    expect(body.contact).toMatchObject({ firstName: "Khôi", email: "khoi@khach.test", status: "lead", source: "website" });
  });

  it("fills the empty fields of the contact with that email, keeps the rest, and notes that the lead came back", async () => {
    const first = (await push({ firstName: "Ignored", email: "KHOI@khach.test" })).body.contact!;
    // Meanwhile the team learned more: a last name, and the lead became a customer.
    const one = await import("@/app/api/contacts/[id]/route");
    await one.PATCH(req(`/api/contacts/${first.id}`, ADMIN, { method: "PATCH", body: JSON.stringify({ lastName: "Đỗ", status: "customer" }) }), {
      params: Promise.resolve({ id: String(first.id) }),
    });

    const { status, body } = await push({ firstName: "K.", lastName: "Do", email: "khoi@khach.test", phone: "0903123456", city: "Đà Nẵng", status: "lead", source: "zalo" });
    expect(status).toBe(200);
    expect(body.existed).toBe(true);
    expect(body.contact).toMatchObject({ id: first.id, firstName: "Khôi", lastName: "Đỗ", phone: "0903123456", city: "Đà Nẵng", status: "customer", source: "website" });

    const entries = await timeline(String(first.id));
    expect(entries.filter((a) => a.type === "returned").map((a) => a.meta.source)).toEqual(["zalo", null]);
  });

  it("makes one follow-up task for the lead, however often it comes back", async () => {
    const tasks = await import("@/app/api/tasks/route");
    const all = (await (await tasks.GET(req("/api/tasks?state=all", ADMIN))).json()).tasks as { title: string }[];
    expect(all.filter((t) => t.title === "Gọi lại lead Khôi")).toHaveLength(1);
  });

  it("still refuses a second contact with the same email without ifExists", async () => {
    const { status, body } = await push({ firstName: "Khôi", email: "khoi@khach.test" }, MEMBER, "");
    expect(status).toBe(400);
    expect(body.error).toMatch(/already exists/);
  });

  it("gives the new lead to the member it names, so the follow-up task is theirs", async () => {
    const { status, body } = await push({ firstName: "Lan", email: "lan@khach.test", ownerId: binh });
    expect(status).toBe(201);
    expect(body.contact).toMatchObject({ ownerId: binh });
    const tasks = await import("@/app/api/tasks/route");
    const all = (await (await tasks.GET(req("/api/tasks?state=all", ADMIN))).json()).tasks as { title: string; ownerId: string | null }[];
    expect(all.find((t) => t.title === "Gọi lại lead Lan")?.ownerId).toBe(binh);
  });

  it("refuses an ifExists it does not know rather than guess", async () => {
    const { status, body } = await push({ firstName: "Mai", email: "mai@khach.test" }, MEMBER, "?ifExists=update");
    expect(status).toBe(400);
    expect(body.error).toMatch(/ifExists=fill/);
  });

  it("is refused to a viewer, like making a contact", async () => {
    expect((await push({ firstName: "Lan", email: "lan@khach.test" }, VIEWER)).status).toBe(403);
  });
});
