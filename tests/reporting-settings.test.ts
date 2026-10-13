import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * The Reporting currency and Exchange rates are workspace settings an admin
 * sets; every total the dashboard shows is then expressed in that currency.
 * A workspace that never set them keeps the old behaviour: USD at the
 * built-in rates.
 */
describe("reporting currency settings", () => {
  const ADMIN = "frty_reporting_admin";
  const MEMBER = "frty_reporting_member";
  let settingsRoute: typeof import("@/app/api/settings/reporting/route");
  let dashboardRoute: typeof import("@/app/api/stats/dashboard/route");
  let dealRoutes: typeof import("@/app/api/deals/route");

  const req = (key: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      ...init,
    });
  const patch = (key: string, body: Record<string, unknown>) =>
    settingsRoute.PATCH(req(key, "/api/settings/reporting", { method: "PATCH", body: JSON.stringify(body) }));
  const dashboard = async () =>
    (await (await dashboardRoute.GET(req(ADMIN, "/api/stats/dashboard"))).json()) as {
      currency: string;
      kpis: { pipelineValue: number };
    };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    settingsRoute = await import("@/app/api/settings/reporting/route");
    dashboardRoute = await import("@/app/api/stats/dashboard/route");
    dealRoutes = await import("@/app/api/deals/route");

    const ws = await createWorkspace();
    await withWorkspace(ws, async () => {
      for (const [key, role] of [[ADMIN, "admin"], [MEMBER, "member"]] as const) {
        await db.insert(tables.apiKeys).values({
          id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now(),
        });
      }
    });
    for (const body of [
      { name: "Viễn thông Sao Mai — BTS storage", amount: 1_000_000, currency: "VND" },
      { name: "Export pilot", amount: 100, currency: "USD" },
    ]) {
      await dealRoutes.POST(req(ADMIN, "/api/deals", { method: "POST", body: JSON.stringify(body) }));
    }
  });

  it("defaults to USD at the built-in rates", async () => {
    const res = await settingsRoute.GET(req(MEMBER, "/api/settings/reporting"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currency: "USD", perUsd: {}, deliveryField: null, breakdownField: null, lostReasonField: null });

    const stats = await dashboard();
    expect(stats.currency).toBe("USD");
    // 1,000,000 VND at the built-in 0.000039 USD per VND, plus 100 USD.
    expect(stats.kpis.pipelineValue).toBe(139);
  });

  it("only lets an admin change it", async () => {
    expect((await patch(MEMBER, { currency: "VND" })).status).toBe(403);
  });

  it("refuses an unsupported currency, a non-positive rate, or an unknown field", async () => {
    expect((await patch(ADMIN, { currency: "THB" })).status).toBe(400);
    expect((await patch(ADMIN, { perUsd: { VND: 0 } })).status).toBe(400);
    expect((await patch(ADMIN, { deliveryField: "not_a_field" })).status).toBe(400);
    expect((await patch(ADMIN, { breakdownField: "not_a_field" })).status).toBe(400);
  });

  it("expresses dashboard totals in the reporting currency at the admin's rate", async () => {
    const res = await patch(ADMIN, { currency: "VND", perUsd: { VND: 25_000 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ currency: "VND", perUsd: { VND: 25_000 } });

    const stats = await dashboard();
    expect(stats.currency).toBe("VND");
    // 1,000,000 VND as is, plus 100 USD × 25,000.
    expect(stats.kpis.pipelineValue).toBe(3_500_000);
  });
});
