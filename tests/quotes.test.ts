import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 25 (D16): a Quote is made from a deal's line items, numbered per
 * workspace and year, and kept as it was: changing the deal later does not
 * change it. It is on the deal's timeline, and travels with the deal through
 * the Trash.
 */
describe("quotes", () => {
  const ADMIN = "frty_quotes_admin";
  const VIEWER = "frty_quotes_viewer";
  // The workspace's own calendar (Asia/Ho_Chi_Minh unless changed), as the numbering uses.
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(new Date());
  let ws: string;
  let dealId = "";

  const req = (url: string, init: RequestInit = {}, key = ADMIN) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const post = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    return Object.values(await (await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }))).json())[0] as { id: string };
  };
  const setLines = async (lines: Record<string, unknown>[]) => {
    const route = await import("@/app/api/deals/[id]/lines/route");
    return route.PUT(req(`/api/deals/${dealId}/lines`, { method: "PUT", body: JSON.stringify({ lines }) }), params({ id: dealId }));
  };
  const makeQuote = async (deal: string, body: Record<string, unknown> = {}, key = ADMIN) => {
    const route = await import("@/app/api/deals/[id]/quotes/route");
    return route.POST(req(`/api/deals/${deal}/quotes`, { method: "POST", body: JSON.stringify(body) }, key), params({ id: deal }));
  };
  const getQuote = async (id: string, key = ADMIN) => {
    const route = await import("@/app/api/quotes/[id]/route");
    return route.GET(req(`/api/quotes/${id}`, {}, key), params({ id }));
  };
  const listQuotes = async (deal: string, key = ADMIN) => {
    const route = await import("@/app/api/deals/[id]/quotes/route");
    return route.GET(req(`/api/deals/${deal}/quotes`, {}, key), params({ id: deal }));
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
    const company = await post("companies", { name: "Fiesta Resort" });
    const contact = await post("contacts", { firstName: "Lan", lastName: "Trần", email: "lan@khach.test", companyId: company.id });
    dealId = (await post("deals", { name: "Pin kho lạnh", currency: "VND", companyId: company.id, contactId: contact.id })).id;
  });

  it("refuses a quote for a deal with no line items", async () => {
    const res = await makeQuote(dealId);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("line items");
  });

  it("numbers quotes per year and copies in the buyer, lines and total", async () => {
    await setLines([
      { name: "Pin Pytes 5kWh", quantity: 3, unitPrice: 30_000_000 },
      { name: "Lắp đặt", quantity: 1, unitPrice: 5_000_000 },
    ]);
    const res = await makeQuote(dealId, { validDays: 15, terms: "Thanh toán 50% khi đặt hàng" });
    expect(res.status).toBe(201);
    const quote = (await res.json()).quote;
    expect(quote).toMatchObject({ number: `BG-${year}-0001`, currency: "VND", total: 95_000_000, terms: "Thanh toán 50% khi đặt hàng" });
    expect(quote.validUntil - quote.issuedAt).toBe(15 * 86_400_000);
    expect(quote.buyer).toMatchObject({ company: "Fiesta Resort", contact: "Lan Trần", email: "lan@khach.test" });
    expect(quote.lines.map((l: { name: string; total: number }) => [l.name, l.total])).toEqual([
      ["Pin Pytes 5kWh", 90_000_000],
      ["Lắp đặt", 5_000_000],
    ]);
    const second = (await (await makeQuote(dealId)).json()).quote;
    expect(second.number).toBe(`BG-${year}-0002`);
  });

  it("keeps a quote as it was made when the deal changes", async () => {
    const first = ((await (await listQuotes(dealId)).json()).quotes as { id: string; number: string }[]).find((q) => q.number.endsWith("0001"))!;
    await setLines([{ name: "Khác hẳn", quantity: 1, unitPrice: 1 }]);
    const quote = (await (await getQuote(first.id)).json()).quote;
    expect(quote.total).toBe(95_000_000);
    expect(quote.lines).toHaveLength(2);
  });

  it("is on the deal's timeline", async () => {
    const activities = await import("@/app/api/activities/route");
    const entries = (await (await activities.GET(req(`/api/activities?entityType=deal&entityId=${dealId}`))).json()).activities as {
      type: string;
      meta: Record<string, unknown>;
    }[];
    expect(entries.filter((a) => a.type === "quote").map((a) => a.meta.number)).toEqual(expect.arrayContaining([`BG-${year}-0001`, `BG-${year}-0002`]));
  });

  it("lets a viewer read quotes but not make one, and hides them from a role that cannot see amounts", async () => {
    expect((await makeQuote(dealId, {}, VIEWER)).status).toBe(403);
    const list = await listQuotes(dealId, VIEWER);
    expect(list.status).toBe(200);
    const id = ((await list.json()).quotes as { id: string }[])[0]!.id;
    const perms = await import("@/app/api/field-permissions/route");
    // A contact's hidden email stays hidden inside a quote too.
    await perms.POST(req("/api/field-permissions", { method: "POST", body: JSON.stringify({ object: "contacts", field: "email", role: "viewer", canRead: false, canWrite: false }) }));
    expect((await (await getQuote(id, VIEWER)).json()).quote.buyer).toMatchObject({ email: null, contact: "Lan Trần" });
    await perms.POST(req("/api/field-permissions", { method: "POST", body: JSON.stringify({ object: "deals", field: "amount", role: "viewer", canRead: false, canWrite: false }) }));
    expect((await getQuote(id, VIEWER)).status).toBe(403);
    expect((await listQuotes(dealId, VIEWER)).status).toBe(403);
  });

  it("keeps its number while its deal is in the Trash, and is there when the deal comes back", async () => {
    const dealRoute = await import("@/app/api/deals/[id]/route");
    await dealRoute.DELETE(req(`/api/deals/${dealId}`, { method: "DELETE" }), params({ id: dealId }));
    // Another deal's next quote does not take a number already used.
    const other = (await post("deals", { name: "Khác", currency: "VND" })).id;
    const lines = await import("@/app/api/deals/[id]/lines/route");
    await lines.PUT(req(`/api/deals/${other}/lines`, { method: "PUT", body: JSON.stringify({ lines: [{ name: "X", quantity: 1, unitPrice: 1 }] }) }), params({ id: other }));
    expect((await (await makeQuote(other)).json()).quote.number).toBe(`BG-${year}-0003`);
    const trash = await import("@/app/api/trash/route");
    const item = ((await (await trash.GET(req("/api/trash"))).json()).items as { id: string; entityId: string }[]).find((i) => i.entityId === dealId)!;
    const restore = await import("@/app/api/trash/[id]/restore/route");
    await restore.POST(req(`/api/trash/${item.id}/restore`, { method: "POST" }), params({ id: item.id }));
    expect(((await (await listQuotes(dealId)).json()).quotes as unknown[]).length).toBe(2);
  });
});
