import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 16 (D7): a contact or company has an Owner who can be changed after
 * it is created, one at a time or many at once, and lists filter by Owner,
 * the way Deals already do.
 */
describe("owner of contacts and companies", () => {
  const KEY = "frty_record_owner";
  const people = { binh: "", lan: "" };
  let ws: string;

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const create = async (path: "contacts" | "companies", body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    return route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
  };
  const patch = async (path: "contacts" | "companies", id: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/[id]/route`)) as { PATCH: (r: Request, p: unknown) => Promise<Response> };
    return route.PATCH(req(`/api/${path}/${id}`, { method: "PATCH", body: JSON.stringify(body) }), params({ id }));
  };
  const list = async (path: "contacts" | "companies", query: string) => {
    const route = (await import(`@/app/api/${path}/route`)) as { GET: (r: Request) => Promise<Response> };
    const body = await (await route.GET(req(`/api/${path}?${query}`))).json();
    return (body[path] as { id: string }[]).map((r) => r.id);
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: auth.sha256(KEY), role: "admin", createdAt: Date.now() }),
    );
    people.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    people.lan = await auth.createUser("lan@team.test", "LTHoa", "lan-password-1");
    await db.insert(tables.workspaceMembers).values([
      { id: newId(), workspaceId: ws, userId: people.binh, role: "member", createdAt: Date.now() },
      { id: newId(), workspaceId: ws, userId: people.lan, role: "member", createdAt: Date.now() },
    ]);
  });

  it("takes an owner when a contact is created, and hands it over later with a timeline line", async () => {
    const res = await create("contacts", { firstName: "Khôi", lastName: "Đỗ", ownerId: people.binh });
    expect(res.status).toBe(201);
    const contact = (await res.json()).contact as { id: string; ownerId: string };
    expect(contact.ownerId).toBe(people.binh);

    const moved = await patch("contacts", contact.id, { ownerId: people.lan });
    expect((await moved.json()).contact.ownerId).toBe(people.lan);
    const activities = await import("@/app/api/activities/route");
    const entries = (await (await activities.GET(req(`/api/activities?entityType=contact&entityId=${contact.id}`))).json()).activities as {
      type: string;
      meta: Record<string, unknown>;
    }[];
    expect(entries.find((a) => a.type === "owner_changed")?.meta).toMatchObject({ from: "DVHai", to: "LTHoa" });
  });

  it("refuses an owner who is not a member of the workspace", async () => {
    const res = await create("companies", { name: "Vạn Cát", ownerId: "nobody" });
    expect(res.status).toBe(400);
  });

  it("filters contacts and companies by owner, or by having none", async () => {
    const mine = (await (await create("companies", { name: "Fiesta", ownerId: people.binh })).json()).company.id as string;
    const nobody = (await (await create("companies", { name: "Điện lực", ownerId: null })).json()).company.id as string;
    expect(await list("companies", `ownerId=${people.binh}`)).toEqual([mine]);
    expect(await list("companies", "ownerId=none")).toContain(nobody);
    expect(await list("companies", "ownerId=none")).not.toContain(mine);
  });

  it("gives many contacts or companies one owner at once, all or nothing", async () => {
    const a = (await (await create("contacts", { firstName: "A", ownerId: people.binh })).json()).contact.id as string;
    const b = (await (await create("contacts", { firstName: "B", ownerId: people.binh })).json()).contact.id as string;
    const route = await import("@/app/api/contacts/reassign/route");
    const refused = await route.POST(req("/api/contacts/reassign", { method: "POST", body: JSON.stringify({ ids: [a, "missing"], ownerId: people.lan }) }));
    expect(refused.status).toBe(404);
    expect(await list("contacts", `ownerId=${people.lan}`)).not.toContain(a);

    const done = await route.POST(req("/api/contacts/reassign", { method: "POST", body: JSON.stringify({ ids: [a, b], ownerId: people.lan }) }));
    expect(await done.json()).toEqual({ updated: 2 });
    expect(await list("contacts", `ownerId=${people.lan}`)).toEqual(expect.arrayContaining([a, b]));

    const companies = await import("@/app/api/companies/reassign/route");
    const fiesta = (await list("companies", `ownerId=${people.binh}`))[0]!;
    const res = await companies.POST(req("/api/companies/reassign", { method: "POST", body: JSON.stringify({ ids: [fiesta], ownerId: null }) }));
    expect(await res.json()).toEqual({ updated: 1 });
    expect(await list("companies", "ownerId=none")).toContain(fiesta);
  });
});
