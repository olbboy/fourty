import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * GET /api/stats/reports carries two Forecast period tables — by Expected
 * close date and by Delivery date — in the Reporting currency, split by the
 * Breakdown field the admin picked. A role that cannot read amounts gets
 * neither table.
 */
describe("forecast tables on the reports API", () => {
  const ADMIN = "frty_forecast_admin";
  const VIEWER = "frty_forecast_viewer";
  let reportsRoute: typeof import("@/app/api/stats/reports/route");
  let settingsRoute: typeof import("@/app/api/settings/reporting/route");

  const req = (key: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      ...init,
    });
  const post = async (url: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${url}/route`)) as { POST: (r: Request) => Promise<Response> };
    const res = await route.POST(req(ADMIN, `/api/${url}`, { method: "POST", body: JSON.stringify(body) }));
    if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  type Table = { columns: string[]; rows: { period: string; weighted: number; total: number; count: number; byBreakdown: Record<string, number> }[] };
  const reports = async (key: string) =>
    (await (await reportsRoute.GET(req(key, "/api/stats/reports"))).json()) as {
      currency: string;
      forecast?: { byClose?: Table; byDelivery: Table | null };
    };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    reportsRoute = await import("@/app/api/stats/reports/route");
    settingsRoute = await import("@/app/api/settings/reporting/route");

    const ws = await createWorkspace();
    await withWorkspace(ws, async () => {
      for (const [key, role] of [[ADMIN, "admin"], [VIEWER, "viewer"]] as const) {
        await db.insert(tables.apiKeys).values({
          id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now(),
        });
      }
      await db.insert(tables.fieldPermissions).values({
        id: newId(), workspaceId: ws, object: "deals", field: "amount", role: "viewer", canRead: 0, canWrite: 0, createdAt: Date.now(),
      });
    });

    await post("custom-fields", { entity: "deal", key: "sales_motion", label: "Loại hình bán", type: "select", options: ["Dự án trực tiếp", "Đấu thầu"] });
    await post("custom-fields", { entity: "deal", key: "planned_ship_date", label: "Ngày xuất dự kiến", type: "date" });
    await post("deals", {
      name: "Viễn thông Sao Mai", amount: 30_000_000_000, currency: "VND", expectedCloseDate: Date.UTC(2026, 4, 10, 5),
      custom: { sales_motion: "Dự án trực tiếp", planned_ship_date: "2026-08-15" },
    });
    await post("deals", {
      name: "Điện lực Vùng 2", amount: 80_000_000_000, currency: "VND", expectedCloseDate: Date.UTC(2027, 1, 1, 5),
      custom: { sales_motion: "Đấu thầu" },
    });
  });

  it("has no delivery table until the admin picks the delivery date field", async () => {
    const out = await reports(ADMIN);
    expect(out.forecast?.byDelivery).toBeNull();
    expect(out.forecast?.byClose?.columns).toEqual([]);
  });

  it("splits by the breakdown field and dates by both fields once they are set", async () => {
    await settingsRoute.PATCH(req(ADMIN, "/api/settings/reporting", {
      method: "PATCH",
      body: JSON.stringify({ currency: "VND", deliveryField: "planned_ship_date", breakdownField: "sales_motion" }),
    }));
    const out = await reports(ADMIN);
    expect(out.currency).toBe("VND");

    const byClose = out.forecast!.byClose!;
    expect(byClose.columns).toEqual(["Dự án trực tiếp", "Đấu thầu"]);
    // Both deals sit in the default pipeline's first stage, so weighted = amount × its probability.
    const q2 = byClose.rows.find((r) => r.period === "2026-Q2")!;
    expect(q2).toMatchObject({ total: 30_000_000_000, count: 1 });
    expect(q2.byBreakdown["Đấu thầu"]).toBe(0);
    expect(byClose.rows.find((r) => r.period === "2027-Q1")).toMatchObject({ total: 80_000_000_000, count: 1 });

    const byDelivery = out.forecast!.byDelivery!;
    expect(byDelivery.rows.find((r) => r.period === "2026-Q3")).toMatchObject({ total: 30_000_000_000, count: 1 });
    expect(byDelivery.rows.find((r) => r.period === "undated")).toMatchObject({ total: 80_000_000_000, count: 1 });
  });

  it("leaves both tables out for a role that cannot read amounts", async () => {
    const out = await reports(VIEWER);
    expect(out.forecast).toBeUndefined();
  });
});
