import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 12 (D3): deleting a contact, company, deal or task moves it to the
 * Trash with its notes and timeline for 30 days; restoring puts it all back
 * and re-links what it was detached from.
 */
describe("trash", () => {
  const ADMIN = "frty_trash_admin";
  const MEMBER = "frty_trash_member";
  const VIEWER = "frty_trash_viewer";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let ws: string;

  const req = (key: string, url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const create = async (path: string, body: Record<string, unknown>, key = ADMIN) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    const res = await route.POST(req(key, `/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
    return (await res.json()) as Record<string, { id: string }>;
  };
  const remove = async (path: string, id: string, key = ADMIN) => {
    const route = (await import(`@/app/api/${path}/[id]/route`)) as {
      DELETE: (r: Request, p: unknown) => Promise<Response>;
    };
    return route.DELETE(req(key, `/api/${path}/${id}`, { method: "DELETE" }), params({ id }));
  };
  const trash = async (key = ADMIN) => {
    const route = await import("@/app/api/trash/route");
    return ((await (await route.GET(req(key, "/api/trash"))).json()).items ?? []) as {
      id: string;
      entityType: string;
      entityId: string;
      label: string;
    }[];
  };
  const restore = async (trashId: string, key = ADMIN) => {
    const route = await import("@/app/api/trash/[id]/restore/route");
    return route.POST(req(key, `/api/trash/${trashId}/restore`, { method: "POST" }), params({ id: trashId }));
  };
  const notesOn = async (entityType: string, entityId: string) => {
    const route = await import("@/app/api/notes/route");
    const res = await route.GET(req(ADMIN, `/api/notes?entityType=${entityType}&entityId=${entityId}`));
    return ((await res.json()).notes as { body: string }[]).map((n) => n.body);
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values(
        [
          [ADMIN, "admin"],
          [MEMBER, "member"],
          [VIEWER, "viewer"],
        ].map(([key, role]) => ({
          id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now(),
        })),
      ),
    );
  });

  it("puts a deleted company back with its note, and re-links its contact", async () => {
    const { company } = await create("companies", { name: "Vạn Cát" });
    const { contact } = await create("contacts", { firstName: "Khôi", lastName: "Đỗ", companyId: company.id });
    await create("notes", { entityType: "company", entityId: company.id, body: "Khảo sát xong tuần trước" });

    expect((await remove("companies", company.id)).status).toBe(200);
    const item = (await trash()).find((i) => i.entityId === company.id)!;
    expect(item).toMatchObject({ entityType: "company", label: "Vạn Cát" });
    expect(await notesOn("company", company.id)).toEqual([]);

    expect((await restore(item.id)).status).toBe(200);
    expect(await notesOn("company", company.id)).toEqual(["Khảo sát xong tuần trước"]);
    const contactRoute = await import("@/app/api/contacts/[id]/route");
    const back = await (await contactRoute.GET(req(ADMIN, `/api/contacts/${contact.id}`), params({ id: contact.id }))).json();
    expect(back.contact.companyId).toBe(company.id);
    expect((await trash()).some((i) => i.id === item.id)).toBe(false);
  });

  it("restores a deal in the stage it was in", async () => {
    const { deal } = await create("deals", { name: "Điện lực Vùng 1", amount: 5e9, currency: "VND" });
    expect((await remove("deals", deal.id)).status).toBe(200);
    const item = (await trash()).find((i) => i.entityId === deal.id)!;
    expect((await restore(item.id)).status).toBe(200);
    const dealRoute = await import("@/app/api/deals/[id]/route");
    const back = (await (await dealRoute.GET(req(ADMIN, `/api/deals/${deal.id}`), params({ id: deal.id }))).json()).deal;
    expect(back).toMatchObject({ name: "Điện lực Vùng 1", amount: 5e9, stageId: (deal as unknown as { stageId: string }).stageId });
  });

  it("refuses to restore a contact whose email a new contact took meanwhile", async () => {
    const { contact } = await create("contacts", { firstName: "Lan", lastName: "Trần", email: "lan@khach.test" });
    await remove("contacts", contact.id);
    await create("contacts", { firstName: "Lan", lastName: "Mới", email: "lan@khach.test" });
    const item = (await trash()).find((i) => i.entityId === contact.id)!;
    expect((await restore(item.id)).status).toBe(409);
  });

  it("lets a member restore, a viewer only look, and only an admin purge for good", async () => {
    const { task } = await create("tasks", { title: "Gọi lại Fiesta" });
    await remove("tasks", task.id, MEMBER);
    const item = (await trash(VIEWER)).find((i) => i.entityId === task.id)!;
    expect((await restore(item.id, VIEWER)).status).toBe(403);

    const purge = await import("@/app/api/trash/[id]/route");
    expect((await purge.DELETE(req(MEMBER, `/api/trash/${item.id}`, { method: "DELETE" }), params({ id: item.id }))).status).toBe(403);
    expect((await purge.DELETE(req(ADMIN, `/api/trash/${item.id}`, { method: "DELETE" }), params({ id: item.id }))).status).toBe(200);
    expect((await trash()).some((i) => i.id === item.id)).toBe(false);

    const { task: again } = await create("tasks", { title: "Gửi hồ sơ" });
    await remove("tasks", again.id, MEMBER);
    const next = (await trash()).find((i) => i.entityId === again.id)!;
    expect((await restore(next.id, MEMBER)).status).toBe(200);
  });

  it("forgets what was deleted more than 30 days ago", async () => {
    const { task } = await create("tasks", { title: "Việc cũ" });
    await remove("tasks", task.id);
    const item = (await trash()).find((i) => i.entityId === task.id)!;
    const { eq } = await import("drizzle-orm");
    await withWorkspace(ws, () =>
      db.update(tables.trash).set({ deletedAt: Date.now() - 31 * 86_400_000 }).where(eq(tables.trash.id, item.id)),
    );
    expect((await trash()).some((i) => i.id === item.id)).toBe(false);
  });

  it("is emptied of expired records by the worker's tick, without anyone opening it", async () => {
    const { task } = await create("tasks", { title: "Việc quá hạn trong thùng" });
    await remove("tasks", task.id);
    const { eq } = await import("drizzle-orm");
    const { purgeExpiredTrash } = await import("@/lib/trash");
    const left = await withWorkspace(ws, async () => {
      await db.update(tables.trash).set({ deletedAt: Date.now() - 31 * 86_400_000 }).where(eq(tables.trash.entityId, task.id));
      await purgeExpiredTrash();
      return db.select({ id: tables.trash.id }).from(tables.trash).where(eq(tables.trash.entityId, task.id));
    });
    expect(left).toEqual([]);
  });
});
