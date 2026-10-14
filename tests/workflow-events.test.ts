import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 29 (D20): workflows (and the webhooks they send) can start when a
 * deal's value changes, and when a contact, company or deal is deleted. A
 * deleted record takes no new task or note.
 */
describe("workflow events: value changed, deleted", () => {
  const KEY = "frty_workflow_events";
  let ws: string;

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const workflow = async (event: string, actions: Record<string, unknown>[], name = event) => {
    const route = await import("@/app/api/workflows/route");
    const res = await route.POST(req("/api/workflows", { method: "POST", body: JSON.stringify({ name, trigger: { event }, actions }) }));
    expect(res.status).toBe(201);
  };
  const runs = async (name: string) => {
    const route = await import("@/app/api/workflows/route");
    const list = (await (await route.GET(req("/api/workflows"))).json()).workflows as { name: string; runCount: number }[];
    return list.find((w) => w.name === name)?.runCount ?? 0;
  };
  const create = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    return Object.values(await (await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }))).json())[0] as { id: string };
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

  it("runs on a change of a deal's amount or close date, not on any other edit", async () => {
    await workflow("deal.value_changed", [{ type: "log", message: "value {{amount}}" }]);
    const deal = await create("deals", { name: "Fiesta", amount: 20e9, currency: "VND" });
    const route = await import("@/app/api/deals/[id]/route");
    const patch = (body: Record<string, unknown>) => route.PATCH(req(`/api/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify(body) }), params({ id: deal.id }));
    await patch({ name: "Fiesta Resort" });
    expect(await runs("deal.value_changed")).toBe(0);
    await patch({ amount: 18e9 });
    await patch({ expectedCloseDate: Date.now() + 86_400_000 });
    expect(await runs("deal.value_changed")).toBe(2);
  });

  it("runs when a contact, company or deal is deleted, and adds nothing to the deleted record", async () => {
    await workflow("contact.deleted", [{ type: "log", message: "gone {{firstName}}" }, { type: "add_note", body: "should not be written" }]);
    await workflow("company.deleted", [{ type: "log", message: "gone {{name}}" }]);
    await workflow("deal.deleted", [{ type: "create_task", title: "should not be created" }]);
    const contact = await create("contacts", { firstName: "Khôi" });
    const company = await create("companies", { name: "Vạn Cát" });
    const deal = await create("deals", { name: "Điện lực" });
    for (const [path, id] of [
      ["contacts", contact.id],
      ["companies", company.id],
      ["deals", deal.id],
    ] as const) {
      const route = (await import(`@/app/api/${path}/[id]/route`)) as { DELETE: (r: Request, p: unknown) => Promise<Response> };
      expect((await route.DELETE(req(`/api/${path}/${id}`, { method: "DELETE" }), params({ id }))).status).toBe(200);
    }
    expect([await runs("contact.deleted"), await runs("company.deleted"), await runs("deal.deleted")]).toEqual([1, 1, 1]);

    const tasks = await import("@/app/api/tasks/route");
    const all = (await (await tasks.GET(req("/api/tasks?state=all"))).json()).tasks as { title: string }[];
    expect(all.map((t) => t.title)).not.toContain("should not be created");
  });

  it("runs for each record deleted together, and for a duplicate merged away, saying where it went", async () => {
    await workflow("contact.deleted", [{ type: "log", message: "into {{mergedInto}}" }], "merged into");
    const one = await create("deals", { name: "Một" });
    const two = await create("deals", { name: "Hai" });
    const bulk = await import("@/app/api/deals/bulk-delete/route");
    expect((await bulk.POST(req("/api/deals/bulk-delete", { method: "POST", body: JSON.stringify({ ids: [one.id, two.id] }) }))).status).toBe(200);
    expect(await runs("deal.deleted")).toBe(3);

    const keep = await create("contacts", { firstName: "Lan", email: "lan@khach.test" });
    const dupe = await create("contacts", { firstName: "Lan", lastName: "Trần" });
    const merge = await import("@/app/api/contacts/[id]/merge/route");
    const merged = await merge.POST(req(`/api/contacts/${keep.id}/merge`, { method: "POST", body: JSON.stringify({ duplicateId: dupe.id }) }), params({ id: keep.id }));
    expect(merged.status).toBe(200);
    expect(await runs("contact.deleted")).toBe(2);

    const list = await import("@/app/api/workflows/route");
    const id = ((await (await list.GET(req("/api/workflows"))).json()).workflows as { id: string; name: string }[]).find((w) => w.name === "merged into")!.id;
    const detail = await import("@/app/api/workflows/[id]/route");
    const latest = ((await (await detail.GET(req(`/api/workflows/${id}`), params({ id }))).json()).runs as { entityId: string; log: unknown }[])[0]!;
    expect(latest.entityId).toBe(dupe.id);
    expect(JSON.stringify(latest.log)).toContain(`into ${keep.id}`);
  });
});
