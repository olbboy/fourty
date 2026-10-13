import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * A deal's currency must be one Fourty can convert. An unknown code used to be
 * stored and then summed unconverted, so 50,000,000 THB counted as 50,000,000
 * USD on the dashboard.
 */
describe("deal currency", () => {
  const KEY = "frty_deal_currency";
  let dealRoutes: typeof import("@/app/api/deals/route");
  let dealIdRoutes: typeof import("@/app/api/deals/[id]/route");

  const headers = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, { headers, ...init });
  const createDeal = (body: Record<string, unknown>) =>
    dealRoutes.POST(req("/api/deals", { method: "POST", body: JSON.stringify(body) }));

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    dealRoutes = await import("@/app/api/deals/route");
    dealIdRoutes = await import("@/app/api/deals/[id]/route");

    const ws = await createWorkspace();
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values({
        id: newId(),
        workspaceId: ws,
        name: "admin",
        prefix: KEY.slice(0, 8),
        keyHash: sha256(KEY),
        role: "admin",
        createdAt: Date.now(),
      });
    });
  });

  it("accepts a supported currency", async () => {
    const res = await createDeal({ name: "Hồ Bạc — battery refit", amount: 5_000_000_000, currency: "VND" });
    expect(res.status).toBe(201);
    expect((await res.json()).deal.currency).toBe("VND");
  });

  it("refuses an unsupported currency on create and on patch", async () => {
    const refused = await createDeal({ name: "Thai partner", amount: 50_000_000, currency: "THB" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/currency/);

    const deal = (await (await createDeal({ name: "Viễn thông Mekong", currency: "VND" })).json()).deal as { id: string };
    const patched = await dealIdRoutes.PATCH(
      req(`/api/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ currency: "LAK" }) }),
      { params: Promise.resolve({ id: deal.id }) },
    );
    expect(patched.status).toBe(400);
  });
});
