import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 5: a deal's timeline says what a value was and what it became, for the
 * Amount, the Expected close date and the Delivery date; and once an admin
 * names a lost-reason field, a deal cannot close as lost without one.
 */
describe("deal value history and lost reason", () => {
  const KEY = "frty_value_history";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let dealRoutes: typeof import("@/app/api/deals/route");
  let dealIdRoutes: typeof import("@/app/api/deals/[id]/route");
  let activityRoutes: typeof import("@/app/api/activities/route");
  let reportingRoutes: typeof import("@/app/api/settings/reporting/route");
  let ws: string;
  const stages: Record<"first" | "second" | "lost", string> = { first: "", second: "", lost: "" };

  const headers = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, { headers, ...init });
  const createDeal = async (body: Record<string, unknown>) => {
    const res = await dealRoutes.POST(req("/api/deals", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
    return (await res.json()).deal.id as string;
  };
  const patchDeal = (id: string, body: Record<string, unknown>) =>
    dealIdRoutes.PATCH(req(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id }),
    });
  const setReporting = (body: Record<string, unknown>) =>
    reportingRoutes.PATCH(req("/api/settings/reporting", { method: "PATCH", body: JSON.stringify(body) }));
  /** The newest timeline entry of a type, with meta parsed. */
  const latest = async (dealId: string, type: string) => {
    const res = await activityRoutes.GET(req(`/api/activities?entityType=deal&entityId=${dealId}`));
    const entry = ((await res.json()).activities as { type: string; meta: unknown }[]).find((a) => a.type === type);
    return entry && (typeof entry.meta === "string" ? JSON.parse(entry.meta) : entry.meta);
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    dealRoutes = await import("@/app/api/deals/route");
    dealIdRoutes = await import("@/app/api/deals/[id]/route");
    activityRoutes = await import("@/app/api/activities/route");
    reportingRoutes = await import("@/app/api/settings/reporting/route");
    const fieldRoutes = await import("@/app/api/custom-fields/route");
    const pipelineRoutes = await import("@/app/api/pipelines/route");

    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: sha256(KEY), role: "admin", createdAt: Date.now(),
      }),
    );
    for (const field of [
      { entity: "deal", key: "planned_ship_date", label: "Ngày xuất dự kiến", type: "date" },
      { entity: "deal", key: "loss_reason", label: "Lý do không tiếp tục", type: "select", options: ["Giá", "Đối thủ"] },
    ]) {
      const res = await fieldRoutes.POST(req("/api/custom-fields", { method: "POST", body: JSON.stringify(field) }));
      expect(res.status).toBe(201);
    }
    const { pipelines } = await (await pipelineRoutes.GET(req("/api/pipelines"))).json();
    const list = pipelines[0].stages as { id: string; type: string }[];
    const open = list.filter((s) => s.type === "open");
    stages.first = open[0].id;
    stages.second = open[1].id;
    stages.lost = list.find((s) => s.type === "lost")!.id;
  });

  it("records the old and new Amount and Expected close date", async () => {
    const id = await createDeal({ name: "Điện lực Vùng 2", amount: 80e9, currency: "VND", expectedCloseDate: Date.UTC(2026, 11, 15) });
    expect((await patchDeal(id, { amount: 60e9, expectedCloseDate: Date.UTC(2026, 11, 31) })).status).toBe(200);
    expect((await latest(id, "updated")).changes).toEqual([
      { field: "amount", from: 80e9, to: 60e9, fromCurrency: "VND", toCurrency: "VND" },
      { field: "expectedCloseDate", from: Date.UTC(2026, 11, 15), to: Date.UTC(2026, 11, 31) },
    ]);
  });

  it("records the Delivery date chosen in reporting settings, by its label", async () => {
    expect((await setReporting({ deliveryField: "planned_ship_date" })).status).toBe(200);
    const id = await createDeal({ name: "Fiesta", custom: { planned_ship_date: Date.UTC(2027, 2, 1) } });
    expect((await patchDeal(id, { custom: { planned_ship_date: Date.UTC(2027, 3, 1) } })).status).toBe(200);
    expect((await latest(id, "updated")).changes).toEqual([
      { field: "delivery", label: "Ngày xuất dự kiến", from: Date.UTC(2027, 2, 1), to: Date.UTC(2027, 3, 1) },
    ]);
  });

  it("keeps the value change when the same write moves the stage", async () => {
    const id = await createDeal({ name: "Vạn Cát", amount: 5e9, currency: "VND", stageId: stages.first });
    expect((await patchDeal(id, { stageId: stages.second, amount: 4e9 })).status).toBe(200);
    expect((await latest(id, "stage_changed")).changes).toEqual([
      { field: "amount", from: 5e9, to: 4e9, fromCurrency: "VND", toCurrency: "VND" },
    ]);
  });

  it("closes a deal as lost without a reason while no reason field is chosen", async () => {
    const id = await createDeal({ name: "Đối tác Thái" });
    expect((await patchDeal(id, { stageId: stages.lost })).status).toBe(200);
  });

  it("requires the chosen lost reason before a deal closes as lost", async () => {
    expect((await setReporting({ lostReasonField: "loss_reason" })).status).toBe(200);
    const id = await createDeal({ name: "Bán lẻ 4 nhà hàng" });
    const refused = await patchDeal(id, { stageId: stages.lost });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain("loss_reason");
    expect((await patchDeal(id, { stageId: stages.lost, custom: { loss_reason: "Giá" } })).status).toBe(200);
  });

  it("refuses a lost reason field that is not a choice field", async () => {
    expect((await setReporting({ lostReasonField: "planned_ship_date" })).status).toBe(400);
  });
});
