import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 20 (D11): a "choose several" custom field (tags) on contacts,
 * companies and deals. A record holds any of its choices; filtering by one
 * choice finds every record that has it.
 */
describe("multi-select custom field", () => {
  const KEY = "frty_multiselect";
  let ws: string;

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const post = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    return route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
  };
  const dealsWith = async (value: string) => {
    const route = await import("@/app/api/deals/route");
    const body = await (await route.GET(req(`/api/deals?fieldKey=tags&fieldValue=${encodeURIComponent(value)}`))).json();
    return (body.deals as { name: string }[]).map((d) => d.name).sort();
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: sha256(KEY), role: "admin", createdAt: Date.now() }),
    );
  });

  it("keeps several choices on a deal and refuses one that is not offered", async () => {
    const field = await post("custom-fields", {
      entity: "deal", key: "tags", label: "Nhãn", type: "multiselect", options: ["Đã khảo sát", "Chờ pháp lý", "Ưu tiên"],
    });
    expect(field.status).toBe(201);

    const res = await post("deals", { name: "Điện lực", custom: { tags: ["Đã khảo sát", "Chờ pháp lý"] } });
    expect(res.status).toBe(201);
    expect((await res.json()).deal.custom.tags).toEqual(["Đã khảo sát", "Chờ pháp lý"]);

    const bad = await post("deals", { name: "Sai", custom: { tags: ["Không có"] } });
    expect(bad.status).toBe(400);
  });

  it("takes a single choice written as text, as one choice", async () => {
    const res = await post("deals", { name: "Fiesta", custom: { tags: "Ưu tiên" } });
    expect((await res.json()).deal.custom.tags).toEqual(["Ưu tiên"]);
  });

  it("finds every deal holding a choice when the list filters by it", async () => {
    await post("deals", { name: "Vạn Cát", custom: { tags: ["Ưu tiên", "Chờ pháp lý"] } });
    expect(await dealsWith("Chờ pháp lý")).toEqual(["Điện lực", "Vạn Cát"]);
    expect(await dealsWith("Ưu tiên")).toEqual(["Fiesta", "Vạn Cát"]);
  });

  it("is not offered as the lost-reason field, which needs exactly one choice", async () => {
    const reporting = await import("@/app/api/settings/reporting/route");
    const res = await reporting.PATCH(req("/api/settings/reporting", { method: "PATCH", body: JSON.stringify({ lostReasonField: "tags" }) }));
    expect(res.status).toBe(400);
  });

  it("keeps the forecast breakdown field a single choice", async () => {
    const created = await post("custom-fields", { entity: "deal", key: "sales_motion", label: "Loại hình", type: "select", options: ["Dự án", "Bán lẻ"] });
    const id = (await created.json()).field.id as string;
    const reporting = await import("@/app/api/settings/reporting/route");
    await reporting.PATCH(req("/api/settings/reporting", { method: "PATCH", body: JSON.stringify({ breakdownField: "sales_motion" }) }));
    const route = await import("@/app/api/custom-fields/[id]/route");
    const res = await route.PATCH(req(`/api/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify({ type: "multiselect" }) }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(409);
  });
});
