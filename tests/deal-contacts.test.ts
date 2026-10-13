import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 13 (D4): a Deal has its primary contact and any number of Deal
 * contacts, each with the role they play. The contact's own page lists the
 * deals they take part in. The Trash keeps these links too.
 */
describe("deal contacts", () => {
  const KEY = "frty_deal_contacts";
  let ws: string;
  const ids = { deal: "", primary: "", tech: "", buyer: "" };

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const post = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    const res = await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
    return (await res.json()) as Record<string, { id: string }>;
  };
  const setContacts = async (contacts: { contactId: string; role?: string | null }[]) => {
    const route = await import("@/app/api/deals/[id]/contacts/route");
    return route.PUT(req(`/api/deals/${ids.deal}/contacts`, { method: "PUT", body: JSON.stringify({ contacts }) }), params({ id: ids.deal }));
  };
  const listContacts = async () => {
    const route = await import("@/app/api/deals/[id]/contacts/route");
    const res = await route.GET(req(`/api/deals/${ids.deal}/contacts`), params({ id: ids.deal }));
    return (await res.json()).contacts as { contactId: string; role: string | null; name: string; primary: boolean }[];
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: sha256(KEY), role: "admin", createdAt: Date.now(),
      }),
    );
    ids.primary = (await post("contacts", { firstName: "Minh", lastName: "Lê" })).contact.id;
    ids.tech = (await post("contacts", { firstName: "Hà", lastName: "Phạm" })).contact.id;
    ids.buyer = (await post("contacts", { firstName: "Quân", lastName: "Vũ" })).contact.id;
    ids.deal = (await post("deals", { name: "Điện lực Vùng 1", contactId: ids.primary })).deal.id;
  });

  it("lists the primary contact first, then the deal contacts with their roles", async () => {
    expect((await setContacts([{ contactId: ids.tech, role: "Kỹ thuật" }, { contactId: ids.buyer, role: "Mua sắm" }])).status).toBe(200);
    expect(await listContacts()).toEqual([
      { contactId: ids.primary, role: null, name: "Minh Lê", primary: true },
      { contactId: ids.tech, role: "Kỹ thuật", name: "Hà Phạm", primary: false },
      { contactId: ids.buyer, role: "Mua sắm", name: "Quân Vũ", primary: false },
    ]);
  });

  it("replaces the whole set, ignores the primary contact, and refuses an unknown one", async () => {
    expect((await setContacts([{ contactId: ids.buyer, role: "Quyết định" }, { contactId: ids.primary }])).status).toBe(200);
    expect((await listContacts()).map((c) => [c.contactId, c.role])).toEqual([
      [ids.primary, null],
      [ids.buyer, "Quyết định"],
    ]);
    expect((await setContacts([{ contactId: "nobody" }])).status).toBe(400);
  });

  it("finds the deal from a contact who only takes part in it", async () => {
    const route = await import("@/app/api/deals/route");
    const res = await route.GET(req(`/api/deals?contactId=${ids.buyer}`));
    expect(((await res.json()).deals as { id: string }[]).map((d) => d.id)).toEqual([ids.deal]);
  });

  it("drops a deleted contact from the deal, and brings it back on restore", async () => {
    const contact = await import("@/app/api/contacts/[id]/route");
    expect((await contact.DELETE(req(`/api/contacts/${ids.buyer}`, { method: "DELETE" }), params({ id: ids.buyer }))).status).toBe(200);
    expect((await listContacts()).some((c) => c.contactId === ids.buyer)).toBe(false);

    const trash = await import("@/app/api/trash/route");
    const item = ((await (await trash.GET(req("/api/trash"))).json()).items as { id: string; entityId: string }[]).find(
      (i) => i.entityId === ids.buyer,
    )!;
    const restore = await import("@/app/api/trash/[id]/restore/route");
    expect((await restore.POST(req(`/api/trash/${item.id}/restore`, { method: "POST" }), params({ id: item.id }))).status).toBe(200);
    expect((await listContacts()).find((c) => c.contactId === ids.buyer)).toMatchObject({ role: "Quyết định" });
  });

  it("answers Deal.contacts over GraphQL", async () => {
    const gql = await import("@/app/api/graphql/route");
    const res = await gql.POST(
      req("/api/graphql", {
        method: "POST",
        body: JSON.stringify({ query: `{ deal(id: "${ids.deal}") { contacts { role primary contact { firstName } } } }` }),
      }),
    );
    const body = await res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.deal.contacts.map((c: { contact: { firstName: string }; role: string | null }) => [c.contact.firstName, c.role])).toEqual([
      ["Minh", null],
      ["Quân", "Quyết định"],
    ]);
  });
});
