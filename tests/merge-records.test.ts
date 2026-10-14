import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 22 (D13): Merge folds a duplicate contact or company into the one
 * that stays. Its deals, deal-contact roles, tasks, notes and timeline move
 * over; empty fields of the one that stays take the duplicate's values; the
 * duplicate goes to the Trash.
 */
describe("merging duplicates", () => {
  const ADMIN = "frty_merge_admin";
  const VIEWER = "frty_merge_viewer";
  let ws: string;

  const req = (url: string, init: RequestInit = {}, key = ADMIN) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const create = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    const res = await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
    return Object.values((await res.json()) as Record<string, { id: string }>)[0]!.id;
  };
  const get = async (path: string, id: string) => {
    const route = (await import(`@/app/api/${path}/[id]/route`)) as { GET: (r: Request, p: unknown) => Promise<Response> };
    const res = await route.GET(req(`/api/${path}/${id}`), params({ id }));
    return res.status === 404 ? null : (Object.values(await res.json())[0] as Record<string, unknown>);
  };
  const merge = async (path: "contacts" | "companies", keep: string, duplicateId: string, key = ADMIN) => {
    const route = (await import(`@/app/api/${path}/[id]/merge/route`)) as { POST: (r: Request, p: unknown) => Promise<Response> };
    return route.POST(req(`/api/${path}/${keep}/merge`, { method: "POST", body: JSON.stringify({ duplicateId }) }, key), params({ id: keep }));
  };
  const list = async (path: string, query: string, key: string) => {
    const route = (await import(`@/app/api/${path}/route`)) as { GET: (r: Request) => Promise<Response> };
    return (await (await route.GET(req(`/api/${path}?${query}`))).json())[key] as Record<string, unknown>[];
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
          [VIEWER, "viewer"],
        ].map(([key, role]) => ({ id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now() })),
      ),
    );
  });

  it("moves a duplicate contact's deals, roles, tasks, notes and timeline onto the one that stays", async () => {
    const keep = await create("contacts", { firstName: "Lan", lastName: "Trần", email: "lan@khach.test" });
    const dupe = await create("contacts", { firstName: "Lan", lastName: "Tran", phone: "0903 123 456", jobTitle: "Kế toán" });
    const asPrimary = await create("deals", { name: "Pin kho lạnh", contactId: dupe });
    const keepsPrimary = await create("deals", { name: "Fiesta", contactId: keep });
    const third = await create("deals", { name: "Vạn Cát" });
    const roles = await import("@/app/api/deals/[id]/contacts/route");
    for (const [deal, role] of [
      [keepsPrimary, "Kế toán"],
      [third, "Mua sắm"],
    ] as const) {
      await roles.PUT(req(`/api/deals/${deal}/contacts`, { method: "PUT", body: JSON.stringify({ contacts: [{ contactId: dupe, role }] }) }), params({ id: deal }));
    }
    await create("notes", { entityType: "contact", entityId: dupe, body: "Gọi lại sau Tết" });
    const task = await create("tasks", { title: "Gửi báo giá", entityType: "contact", entityId: dupe });

    const res = await merge("contacts", keep, dupe);
    expect(res.status).toBe(200);

    const kept = (await get("contacts", keep))!;
    expect(kept).toMatchObject({ email: "lan@khach.test", phone: "0903 123 456", jobTitle: "Kế toán", lastName: "Trần" });
    expect(await get("contacts", dupe)).toBeNull();
    expect((await get("deals", asPrimary))!.contactId).toBe(keep);
    expect((await get("tasks", task))!.entityId).toBe(keep);

    const people = async (deal: string) =>
      ((await (await roles.GET(req(`/api/deals/${deal}/contacts`), params({ id: deal }))).json()).contacts as { contactId: string; role: string | null }[]).map(
        (c) => [c.contactId, c.role],
      );
    expect(await people(keepsPrimary)).toEqual([[keep, null]]);
    expect(await people(third)).toEqual([[keep, "Mua sắm"]]);

    const notes = await list("notes", `entityType=contact&entityId=${keep}`, "notes");
    expect(notes.map((n) => n.body)).toContain("Gọi lại sau Tết");
    const timeline = await list("activities", `entityType=contact&entityId=${keep}`, "activities");
    expect(timeline.find((a) => a.type === "merged")?.meta).toMatchObject({ from: "Lan Tran" });

    const trash = await import("@/app/api/trash/route");
    const items = (await (await trash.GET(req("/api/trash"))).json()).items as { entityId: string }[];
    expect(items.map((i) => i.entityId)).toContain(dupe);
  });

  it("moves a duplicate company's people, deals and notes, filling in what the one that stays lacks", async () => {
    const keep = await create("companies", { name: "Fiesta Resort" });
    const dupe = await create("companies", { name: "Fiesta", domain: "fiesta.test", industry: "Khách sạn" });
    const person = await create("contacts", { firstName: "Hà", companyId: dupe });
    const deal = await create("deals", { name: "Điện mặt trời", companyId: dupe });
    await create("notes", { entityType: "company", entityId: dupe, body: "Đã khảo sát mái" });

    expect((await merge("companies", keep, dupe)).status).toBe(200);
    expect((await get("companies", keep))!).toMatchObject({ name: "Fiesta Resort", domain: "fiesta.test", industry: "Khách sạn" });
    expect((await get("contacts", person))!.companyId).toBe(keep);
    expect((await get("deals", deal))!.companyId).toBe(keep);
    expect((await list("notes", `entityType=company&entityId=${keep}`, "notes")).map((n) => n.body)).toContain("Đã khảo sát mái");
    expect(await get("companies", dupe)).toBeNull();
  });

  it("does not keep the one that stays as both primary contact and one of the deal's other people", async () => {
    const keep = await create("contacts", { firstName: "Hà" });
    const dupe = await create("contacts", { firstName: "Ha" });
    const deal = await create("deals", { name: "Kho lạnh", contactId: dupe });
    const roles = await import("@/app/api/deals/[id]/contacts/route");
    await roles.PUT(req(`/api/deals/${deal}/contacts`, { method: "PUT", body: JSON.stringify({ contacts: [{ contactId: keep, role: "Kỹ thuật" }] }) }), params({ id: deal }));
    expect((await merge("contacts", keep, dupe)).status).toBe(200);
    const people = (await (await roles.GET(req(`/api/deals/${deal}/contacts`), params({ id: deal }))).json()).contacts as { contactId: string; primary: boolean }[];
    expect(people).toEqual([expect.objectContaining({ contactId: keep, primary: true })]);
  });

  it("joins the tags of both records", async () => {
    const field = await import("@/app/api/custom-fields/route");
    await field.POST(req("/api/custom-fields", { method: "POST", body: JSON.stringify({ entity: "contact", key: "tags", label: "Nhãn", type: "multiselect", options: ["VIP", "Hội chợ"] }) }));
    const keep = await create("contacts", { firstName: "Tag", custom: { tags: ["VIP"] } });
    const dupe = await create("contacts", { firstName: "Tag2", custom: { tags: ["Hội chợ"] } });
    expect((await merge("contacts", keep, dupe)).status).toBe(200);
    expect(((await get("contacts", keep))!.custom as { tags: string[] }).tags.sort()).toEqual(["Hội chợ", "VIP"]);
  });

  it("refuses a record merged into itself, an unknown duplicate, and a viewer", async () => {
    const a = await create("contacts", { firstName: "A" });
    const b = await create("contacts", { firstName: "B" });
    expect((await merge("contacts", a, a)).status).toBe(400);
    expect((await merge("contacts", a, "missing")).status).toBe(404);
    expect((await merge("contacts", a, b, VIEWER)).status).toBe(403);
    expect(await get("contacts", b)).not.toBeNull();
  });
});
