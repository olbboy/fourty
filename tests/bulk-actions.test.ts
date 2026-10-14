import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 17 (D8): many records at once from a list. Each record goes through
 * its own single-record action, so a bulk change leaves the same timeline,
 * audit and Trash entries as one-by-one edits. All or nothing.
 */
describe("bulk actions", () => {
  const ADMIN = "frty_bulk_admin";
  const VIEWER = "frty_bulk_viewer";
  const stages = { first: "", second: "", lost: "" };
  let ws: string;

  const req = (url: string, init: RequestInit = {}, key = ADMIN) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const post = async (path: string, body: Record<string, unknown>, key = ADMIN) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    return route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }, key));
  };
  const created = async (path: string, body: Record<string, unknown>) => {
    const res = await post(path, body);
    expect(res.status).toBe(201);
    return Object.values((await res.json()) as Record<string, { id: string }>)[0]!.id;
  };
  const dealStage = async (id: string) => {
    const route = await import("@/app/api/deals/[id]/route");
    const res = await route.GET(req(`/api/deals/${id}`), { params: Promise.resolve({ id }) });
    return res.status === 404 ? null : ((await res.json()).deal.stageId as string);
  };
  const trashed = async () => {
    const route = await import("@/app/api/trash/route");
    return ((await (await route.GET(req("/api/trash"))).json()).items as { entityId: string }[]).map((i) => i.entityId);
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
    expect(
      (await post("custom-fields", { entity: "deal", key: "loss_reason", label: "Lý do", type: "select", options: ["Giá", "Đối thủ"] })).status,
    ).toBe(201);
    const pipelines = await import("@/app/api/pipelines/route");
    const list = (await (await pipelines.GET(req("/api/pipelines"))).json()).pipelines[0].stages as { id: string; type: string }[];
    const open = list.filter((s) => s.type === "open");
    stages.first = open[0]!.id;
    stages.second = open[1]!.id;
    stages.lost = list.find((s) => s.type === "lost")!.id;
  });

  it("moves several deals to one stage, each with its own timeline line", async () => {
    const a = await created("deals", { name: "A", stageId: stages.first });
    const b = await created("deals", { name: "B", stageId: stages.first });
    const res = await post("deals/bulk-move", { ids: [a, b], stageId: stages.second });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    expect([await dealStage(a), await dealStage(b)]).toEqual([stages.second, stages.second]);

    const activities = await import("@/app/api/activities/route");
    const entries = (await (await activities.GET(req(`/api/activities?entityType=deal&entityId=${a}`))).json()).activities as { type: string }[];
    expect(entries.some((e) => e.type === "stage_changed")).toBe(true);
  });

  it("moves none when one of them cannot go: a lost stage that needs a reason", async () => {
    const reporting = await import("@/app/api/settings/reporting/route");
    await reporting.PATCH(req("/api/settings/reporting", { method: "PATCH", body: JSON.stringify({ lostReasonField: "loss_reason" }) }));
    const withReason = await created("deals", { name: "Có lý do", stageId: stages.first, custom: { loss_reason: "Giá" } });
    const without = await created("deals", { name: "Thiếu lý do", stageId: stages.first });
    const res = await post("deals/bulk-move", { ids: [withReason, without], stageId: stages.lost });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Thiếu lý do");
    expect([await dealStage(withReason), await dealStage(without)]).toEqual([stages.first, stages.first]);
    await reporting.PATCH(req("/api/settings/reporting", { method: "PATCH", body: JSON.stringify({ lostReasonField: null }) }));
  });

  it("deletes several deals into the Trash, or none when one is unknown", async () => {
    const a = await created("deals", { name: "Xoá 1" });
    const b = await created("deals", { name: "Xoá 2" });
    expect((await post("deals/bulk-delete", { ids: [a, "missing"] })).status).toBe(404);
    expect(await dealStage(a)).not.toBeNull();

    expect(await (await post("deals/bulk-delete", { ids: [a, b] })).json()).toEqual({ deleted: 2 });
    expect(await dealStage(a)).toBeNull();
    expect(await trashed()).toEqual(expect.arrayContaining([a, b]));
  });

  it("deletes contacts and companies into the Trash the same way", async () => {
    const contact = await created("contacts", { firstName: "Xoá" });
    const company = await created("companies", { name: "Xoá Co" });
    expect(await (await post("contacts/bulk-delete", { ids: [contact] })).json()).toEqual({ deleted: 1 });
    expect(await (await post("companies/bulk-delete", { ids: [company] })).json()).toEqual({ deleted: 1 });
    expect(await trashed()).toEqual(expect.arrayContaining([contact, company]));
  });

  it("marks several tasks done, and deletes others", async () => {
    const a = await created("tasks", { title: "Gọi Fiesta" });
    const b = await created("tasks", { title: "Gửi hồ sơ" });
    expect(await (await post("tasks/bulk-complete", { ids: [a, b] })).json()).toEqual({ updated: 2 });
    const route = await import("@/app/api/tasks/[id]/route");
    const task = (await (await route.GET(req(`/api/tasks/${a}`), { params: Promise.resolve({ id: a }) })).json()).task;
    expect(task.completedAt).toEqual(expect.any(Number));

    expect(await (await post("tasks/bulk-delete", { ids: [b] })).json()).toEqual({ deleted: 1 });
    expect(await trashed()).toContain(b);
  });

  it("lets a viewer do none of it", async () => {
    const a = await created("deals", { name: "Chỉ xem" });
    expect((await post("deals/bulk-move", { ids: [a], stageId: stages.second }, VIEWER)).status).toBe(403);
    expect((await post("deals/bulk-delete", { ids: [a] }, VIEWER)).status).toBe(403);
  });
});
