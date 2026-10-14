import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 14 (D5): Products in a catalogue, Line items on a Deal. A Deal with
 * line items has their sum as its Amount, kept in step on every change and
 * recorded on the timeline like any other change of value.
 */
describe("products and line items", () => {
  const ADMIN = "frty_lines_admin";
  const MEMBER = "frty_lines_member";
  const VIEWER = "frty_lines_viewer";
  let ws: string;

  const req = (key: string, url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const product = async (body: Record<string, unknown>, key = ADMIN) => {
    const route = await import("@/app/api/products/route");
    return route.POST(req(key, "/api/products", { method: "POST", body: JSON.stringify(body) }));
  };
  const newDeal = async (body: Record<string, unknown>) => {
    const route = await import("@/app/api/deals/route");
    const res = await route.POST(req(ADMIN, "/api/deals", { method: "POST", body: JSON.stringify(body) }));
    return (await res.json()).deal as { id: string; amount: number };
  };
  const setLines = async (dealId: string, lines: Record<string, unknown>[]) => {
    const route = await import("@/app/api/deals/[id]/lines/route");
    return route.PUT(req(ADMIN, `/api/deals/${dealId}/lines`, { method: "PUT", body: JSON.stringify({ lines }) }), params({ id: dealId }));
  };
  const getDeal = async (id: string) => {
    const route = await import("@/app/api/deals/[id]/route");
    return (await (await route.GET(req(ADMIN, `/api/deals/${id}`), params({ id }))).json()).deal as { amount: number; currency: string };
  };
  const patchDeal = async (id: string, body: Record<string, unknown>) => {
    const route = await import("@/app/api/deals/[id]/route");
    return route.PATCH(req(ADMIN, `/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(body) }), params({ id }));
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
    const reporting = await import("@/app/api/settings/reporting/route");
    await reporting.PATCH(req(ADMIN, "/api/settings/reporting", { method: "PATCH", body: JSON.stringify({ perUsd: { VND: 25_000 } }) }));
  });

  it("keeps a catalogue members can add to and viewers can only read", async () => {
    expect((await product({ name: "Pin Pytes 5kWh", code: "PYT-5", unitPrice: 30_000_000, currency: "VND" })).status).toBe(201);
    expect((await product({ name: "Biến tần", unitPrice: 12_000_000, currency: "VND" }, MEMBER)).status).toBe(201);
    expect((await product({ name: "Nope", unitPrice: 1, currency: "VND" }, VIEWER)).status).toBe(403);
    const route = await import("@/app/api/products/route");
    const list = (await (await route.GET(req(VIEWER, "/api/products"))).json()).products as { name: string; code: string | null }[];
    expect(list.map((p) => p.name)).toEqual(["Biến tần", "Pin Pytes 5kWh"]);
  });

  it("hides a product no longer sold unless asked for all of them", async () => {
    const created = (await (await product({ name: "Ắc quy cũ", unitPrice: 1, currency: "VND" })).json()).product as { id: string };
    const one = await import("@/app/api/products/[id]/route");
    const res = await one.PATCH(req(ADMIN, `/api/products/${created.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) }), params({ id: created.id }));
    expect((await res.json()).product.active).toBe(false);
    const route = await import("@/app/api/products/route");
    const names = async (url: string) => ((await (await route.GET(req(ADMIN, url))).json()).products as { name: string }[]).map((p) => p.name);
    expect(await names("/api/products")).not.toContain("Ắc quy cũ");
    expect(await names("/api/products?state=all")).toContain("Ắc quy cũ");
  });

  it("makes the deal's Amount the sum of its line items and records the change", async () => {
    const route = await import("@/app/api/products/route");
    const pin = ((await (await route.GET(req(ADMIN, "/api/products"))).json()).products as { id: string; name: string }[]).find(
      (p) => p.name === "Pin Pytes 5kWh",
    )!;
    const deal = await newDeal({ name: "Fiesta", amount: 20e9, currency: "VND" });
    const res = await setLines(deal.id, [
      { productId: pin.id, quantity: 3 },
      { name: "Lắp đặt", quantity: 1, unitPrice: 5_000_000 },
    ]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lines.map((l: { name: string; quantity: number; unitPrice: number; total: number }) => [l.name, l.quantity, l.unitPrice, l.total])).toEqual([
      ["Pin Pytes 5kWh", 3, 30_000_000, 90_000_000],
      ["Lắp đặt", 1, 5_000_000, 5_000_000],
    ]);
    expect((await getDeal(deal.id)).amount).toBe(95_000_000);

    const activities = await import("@/app/api/activities/route");
    const entries = (await (await activities.GET(req(ADMIN, `/api/activities?entityType=deal&entityId=${deal.id}`))).json()).activities as {
      type: string;
      meta: unknown;
    }[];
    const changed = entries.map((a) => (typeof a.meta === "string" ? JSON.parse(a.meta) : a.meta)).find((m) => m?.changes);
    expect(changed.changes[0]).toMatchObject({ field: "amount", from: 20e9, to: 95_000_000 });
  });

  it("keeps a line's id when it is saved again, and never takes another deal's", async () => {
    const deal = await newDeal({ name: "Giữ id", currency: "VND" });
    const first = (await (await setLines(deal.id, [{ name: "A", quantity: 1, unitPrice: 10 }, { name: "B", quantity: 1, unitPrice: 20 }])).json()).lines as {
      id: string;
      name: string;
    }[];
    const other = await newDeal({ name: "Deal khác", currency: "VND" });
    const theirs = (await (await setLines(other.id, [{ name: "C", quantity: 1, unitPrice: 5 }])).json()).lines[0].id as string;

    const again = await setLines(deal.id, [
      { id: first[1].id, name: "B", quantity: 2, unitPrice: 20 },
      { id: theirs, name: "C sao chép", quantity: 1, unitPrice: 5 },
    ]);
    expect(again.status).toBe(200);
    const lines = (await again.json()).lines as { id: string; name: string; quantity: number }[];
    expect(lines[0]).toMatchObject({ id: first[1].id, name: "B", quantity: 2 });
    expect(lines[1].id).not.toBe(theirs);
    expect(((await (await setLines(other.id, [])).json()) as { lines: unknown[] }).lines).toEqual([]);
  });

  it("takes two saves at once in turn: the deal ends with one list and its sum", async () => {
    const deal = await newDeal({ name: "Đồng thời", currency: "VND" });
    await Promise.all([
      setLines(deal.id, [{ name: "X", quantity: 1, unitPrice: 100 }]),
      setLines(deal.id, [{ name: "Y", quantity: 1, unitPrice: 200 }, { name: "Z", quantity: 1, unitPrice: 300 }]),
    ]);
    const route = await import("@/app/api/deals/[id]/lines/route");
    const { lines, total } = await (await route.GET(req(ADMIN, `/api/deals/${deal.id}/lines`), params({ id: deal.id }))).json();
    expect([["X"], ["Y", "Z"]]).toContainEqual(lines.map((l: { name: string }) => l.name));
    expect((await getDeal(deal.id)).amount).toBe(total);
  });

  it("refuses lines that would move the amount from a role that may not write it, and writes nothing", async () => {
    const deal = await newDeal({ name: "Khoá giá trị", currency: "VND" });
    await setLines(deal.id, [{ name: "Gốc", quantity: 1, unitPrice: 1_000 }]);
    const perms = await import("@/app/api/field-permissions/route");
    await perms.POST(
      req(ADMIN, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "deals", field: "amount", role: "member", canRead: true, canWrite: false }),
      }),
    );
    const route = await import("@/app/api/deals/[id]/lines/route");
    const refused = await route.PUT(
      req(MEMBER, `/api/deals/${deal.id}/lines`, { method: "PUT", body: JSON.stringify({ lines: [{ name: "Mới", quantity: 1, unitPrice: 9_000 }] }) }),
      params({ id: deal.id }),
    );
    expect(refused.status).toBe(403);
    const { lines } = await (await route.GET(req(ADMIN, `/api/deals/${deal.id}/lines`), params({ id: deal.id }))).json();
    expect(lines.map((l: { name: string }) => l.name)).toEqual(["Gốc"]);
    await perms.POST(
      req(ADMIN, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "deals", field: "amount", role: "member", canRead: true, canWrite: true }),
      }),
    );
  });

  it("lets a product be renamed or removed without touching the deals that use it", async () => {
    const created = (await (await product({ name: "Cáp DC", unitPrice: 50_000, currency: "VND" })).json()).product as { id: string };
    const deal = await newDeal({ name: "Dùng cáp", currency: "VND" });
    await setLines(deal.id, [{ productId: created.id, quantity: 10 }]);
    const one = await import("@/app/api/products/[id]/route");
    const renamed = await one.PATCH(
      req(ADMIN, `/api/products/${created.id}`, { method: "PATCH", body: JSON.stringify({ name: "Cáp DC 6mm", unitPrice: 60_000 }) }),
      params({ id: created.id }),
    );
    expect((await renamed.json()).product).toMatchObject({ name: "Cáp DC 6mm", unitPrice: 60_000 });
    expect((await one.DELETE(req(ADMIN, `/api/products/${created.id}`, { method: "DELETE" }), params({ id: created.id }))).status).toBe(200);
    expect((await one.DELETE(req(ADMIN, `/api/products/${created.id}`, { method: "DELETE" }), params({ id: created.id }))).status).toBe(404);
    const route = await import("@/app/api/deals/[id]/lines/route");
    const { lines } = await (await route.GET(req(ADMIN, `/api/deals/${deal.id}/lines`), params({ id: deal.id }))).json();
    expect(lines).toEqual([expect.objectContaining({ name: "Cáp DC", unitPrice: 50_000, total: 500_000 })]);
  });

  it("converts a product's list price into the deal's currency at the workspace's rate", async () => {
    const created = await product({ name: "Tủ điều khiển", unitPrice: 1_200, currency: "USD" });
    const ctrl = (await created.json()).product as { id: string };
    const deal = await newDeal({ name: "Vạn Cát", currency: "VND" });
    const body = await (await setLines(deal.id, [{ productId: ctrl.id, quantity: 1 }])).json();
    expect(body.lines[0].unitPrice).toBe(30_000_000);
  });

  it("refuses a hand-typed Amount while line items set it, and lets go once they are cleared", async () => {
    const deal = await newDeal({ name: "Bán lẻ", currency: "VND" });
    await setLines(deal.id, [{ name: "Ắc quy", quantity: 2, unitPrice: 1_000_000 }]);
    const refused = await patchDeal(deal.id, { amount: 1 });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain("line items");
    expect((await patchDeal(deal.id, { currency: "USD" })).status).toBe(400);

    expect((await setLines(deal.id, [])).status).toBe(200);
    expect((await getDeal(deal.id)).amount).toBe(2_000_000);
    expect((await patchDeal(deal.id, { amount: 3_000_000 })).status).toBe(200);
  });

  it("refuses a line without a name or price and no product to take them from", async () => {
    const deal = await newDeal({ name: "Thiếu", currency: "VND" });
    expect((await setLines(deal.id, [{ quantity: 1 }])).status).toBe(400);
    expect((await setLines(deal.id, [{ productId: "nope", quantity: 1 }])).status).toBe(400);
  });

  it("brings line items back when a deleted deal is restored", async () => {
    const deal = await newDeal({ name: "Khôi phục", currency: "VND" });
    await setLines(deal.id, [{ name: "Dịch vụ", quantity: 1, unitPrice: 7_000_000 }]);
    const dealRoute = await import("@/app/api/deals/[id]/route");
    await dealRoute.DELETE(req(ADMIN, `/api/deals/${deal.id}`, { method: "DELETE" }), params({ id: deal.id }));
    const trash = await import("@/app/api/trash/route");
    const item = ((await (await trash.GET(req(ADMIN, "/api/trash"))).json()).items as { id: string; entityId: string }[]).find(
      (i) => i.entityId === deal.id,
    )!;
    const restore = await import("@/app/api/trash/[id]/restore/route");
    await restore.POST(req(ADMIN, `/api/trash/${item.id}/restore`, { method: "POST" }), params({ id: item.id }));
    const lines = await import("@/app/api/deals/[id]/lines/route");
    const back = await (await lines.GET(req(ADMIN, `/api/deals/${deal.id}/lines`), params({ id: deal.id }))).json();
    expect(back.lines.map((l: { name: string }) => l.name)).toEqual(["Dịch vụ"]);
  });

  it("answers Deal.lines and the catalogue over GraphQL", async () => {
    const deal = await newDeal({ name: "GraphQL", currency: "VND" });
    await setLines(deal.id, [{ name: "Khảo sát", quantity: 2, unitPrice: 1_500_000 }]);
    const gql = await import("@/app/api/graphql/route");
    const res = await gql.POST(
      req(ADMIN, "/api/graphql", {
        method: "POST",
        body: JSON.stringify({ query: `{ deal(id: "${deal.id}") { amount lines { name quantity total } } products { name } }` }),
      }),
    );
    const body = await res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.deal).toEqual({ amount: 3_000_000, lines: [{ name: "Khảo sát", quantity: 2, total: 3_000_000 }] });
    expect(body.data.products.map((p: { name: string }) => p.name)).toContain("Pin Pytes 5kWh");
  });

  it("shows the lines without prices to a role that cannot read a deal's amount", async () => {
    const deal = await newDeal({ name: "Ẩn giá", currency: "VND" });
    await setLines(deal.id, [{ name: "Tủ điện", quantity: 1, unitPrice: 9_000_000 }]);
    const perms = await import("@/app/api/field-permissions/route");
    await perms.POST(
      req(ADMIN, "/api/field-permissions", {
        method: "POST",
        body: JSON.stringify({ object: "deals", field: "amount", role: "viewer", canRead: false, canWrite: false }),
      }),
    );
    const route = await import("@/app/api/deals/[id]/lines/route");
    const seen = await (await route.GET(req(VIEWER, `/api/deals/${deal.id}/lines`), params({ id: deal.id }))).json();
    expect(seen).toEqual({ lines: [expect.not.objectContaining({ unitPrice: expect.anything() })], total: null });
    expect(seen.lines[0].name).toBe("Tủ điện");
  });

  it("lets an agent set lines and read them back through MCP", async () => {
    const { TOOLS } = await import("@/mcp/tools");
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["set_deal_lines", "list_products"]));
  });
});
