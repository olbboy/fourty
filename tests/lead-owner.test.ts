import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Q107, Q114: the Default lead owner. A contact, company, deal or task made by
 * an API key (no person behind the request) that names no owner goes to the
 * member an admin chose, so its follow-up is someone's. Naming an owner, or
 * `null` on purpose, wins.
 */
describe("default lead owner", () => {
  const ADMIN = "frty_leadowner_admin";
  const MEMBER = "frty_leadowner_member";
  let ws: string;
  const people = { binh: "", dai: "" };

  const req = (url: string, key: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const setDefault = async (defaultOwnerId: string | null, key = ADMIN) => {
    const route = await import("@/app/api/settings/leads/route");
    return route.PATCH(req("/api/settings/leads", key, { method: "PATCH", body: JSON.stringify({ defaultOwnerId }) }));
  };
  const lead = async (body: Record<string, unknown>, query = "?ifExists=fill") => {
    const route = await import("@/app/api/contacts/route");
    const res = await route.POST(req(`/api/contacts${query}`, MEMBER, { method: "POST", body: JSON.stringify(body) }));
    return (await res.json()).contact as { id: string; ownerId: string | null };
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values(
        [
          [ADMIN, "admin"],
          [MEMBER, "member"],
        ].map(([key, role]) => ({ id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: auth.sha256(key), role, createdAt: Date.now() })),
      ),
    );
    people.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    people.dai = await auth.createUser("dai@team.test", "NVLong", "dai-password-1");
    for (const userId of [people.binh, people.dai]) {
      await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: ws, userId, role: "member", createdAt: Date.now() });
    }
    const workflows = await import("@/app/api/workflows/route");
    await workflows.POST(
      req("/api/workflows", ADMIN, {
        method: "POST",
        body: JSON.stringify({ name: "Gọi lại lead mới", trigger: { event: "contact.created" }, actions: [{ type: "create_task", title: "Gọi lại lead {{firstName}}", dueInDays: 1 }] }),
      }),
    );
  });

  it("leaves a lead unassigned while no default is chosen", async () => {
    expect((await lead({ firstName: "Một", email: "mot@khach.test" })).ownerId).toBeNull();
  });

  it("lets only an admin choose the default, and only a member of the workspace", async () => {
    expect((await setDefault(people.binh, MEMBER)).status).toBe(403);
    expect((await setDefault("nobody")).status).toBe(400);
    const res = await setDefault(people.binh);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ defaultOwnerId: people.binh });
    const route = await import("@/app/api/settings/leads/route");
    expect(await (await route.GET(req("/api/settings/leads", ADMIN))).json()).toEqual({ defaultOwnerId: people.binh });
  });

  it("gives a lead with no owner to the default, with its follow-up task", async () => {
    const contact = await lead({ firstName: "Hai", email: "hai@khach.test" });
    expect(contact.ownerId).toBe(people.binh);
    const tasks = await import("@/app/api/tasks/route");
    const all = (await (await tasks.GET(req("/api/tasks?state=all", ADMIN))).json()).tasks as { title: string; ownerId: string | null }[];
    expect(all.find((t) => t.title === "Gọi lại lead Hai")?.ownerId).toBe(people.binh);
    // A plain create by a key follows the same rule.
    expect((await lead({ firstName: "Ba" }, "")).ownerId).toBe(people.binh);
  });

  it("keeps the owner a lead names, and null when it says so", async () => {
    expect((await lead({ firstName: "Bốn", email: "bon@khach.test", ownerId: people.dai })).ownerId).toBe(people.dai);
    expect((await lead({ firstName: "Năm", email: "nam@khach.test", ownerId: null })).ownerId).toBeNull();
  });

  it("gives a company, deal or task a key makes without an owner to the default too (Q114)", async () => {
    const made = async (path: string, body: Record<string, unknown>) => {
      const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
      const res = await route.POST(req(`/api/${path}`, MEMBER, { method: "POST", body: JSON.stringify(body) }));
      expect(res.status).toBe(201);
      return Object.values(await res.json())[0] as { ownerId: string | null };
    };
    expect((await made("companies", { name: "Fiesta Resort" })).ownerId).toBe(people.binh);
    expect((await made("deals", { name: "Fiesta — điện mặt trời" })).ownerId).toBe(people.binh);
    expect((await made("tasks", { title: "Gửi báo giá" })).ownerId).toBe(people.binh);
    expect((await made("deals", { name: "Của Đại", ownerId: people.dai })).ownerId).toBe(people.dai);
    expect((await made("tasks", { title: "Chưa giao", ownerId: null })).ownerId).toBeNull();
  });

  it("leaves a lead unassigned rather than refuse it once the default has left", async () => {
    const { db, tables, withWorkspace } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    await withWorkspace(ws, () => db.update(tables.workspaceMembers).set({ deactivatedAt: Date.now() }).where(eq(tables.workspaceMembers.userId, people.binh)));
    expect((await lead({ firstName: "Sáu", email: "sau@khach.test" })).ownerId).toBeNull();
  });
});
