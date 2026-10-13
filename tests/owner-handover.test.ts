import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Handing work over when someone leaves (Phase 4): find a member's deals and
 * tasks, narrow deals by close quarter or a choice field, and move many of
 * them to another owner at once, each move on the record's own timeline.
 */
describe("owner filters and handover", () => {
  const KEY = "frty_owner_handover";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let dealRoutes: typeof import("@/app/api/deals/route");
  let taskRoutes: typeof import("@/app/api/tasks/route");
  let activityRoutes: typeof import("@/app/api/activities/route");
  let ws: string;
  let binh: string;
  let dai: string;
  let bac: string;
  const deals: Record<"dienluc" | "fiesta" | "thai", string> = { dienluc: "", fiesta: "", thai: "" };
  const tasks: Record<"ask" | "visit" | "open", string> = { ask: "", visit: "", open: "" };
  const VIEWER_KEY = "frty_owner_handover_viewer";

  const headers = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, { headers, ...init });
  const listDeals = async (query: string) => {
    const res = await dealRoutes.GET(req(`/api/deals?${query}`));
    expect(res.status).toBe(200);
    return ((await res.json()).deals as { id: string }[]).map((d) => d.id).sort();
  };
  const listTasks = async (query: string) => {
    const res = await taskRoutes.GET(req(`/api/tasks?state=all&${query}`));
    expect(res.status).toBe(200);
    return ((await res.json()).tasks as { id: string }[]).map((t) => t.id).sort();
  };
  const reassign = async (kind: "deals" | "tasks", body: Record<string, unknown>, key = KEY) => {
    const route = kind === "deals" ? await import("@/app/api/deals/reassign/route") : await import("@/app/api/tasks/reassign/route");
    return route.POST(
      new Request(`http://localhost/api/${kind}/reassign`, {
        method: "POST",
        headers: { ...headers, Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      }),
    );
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    dealRoutes = await import("@/app/api/deals/route");
    taskRoutes = await import("@/app/api/tasks/route");
    activityRoutes = await import("@/app/api/activities/route");
    const fieldRoutes = await import("@/app/api/custom-fields/route");

    ws = await createWorkspace();
    binh = newId();
    dai = newId();
    bac = newId();
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: sha256(KEY), role: "admin", createdAt: Date.now(),
      });
      await db.insert(tables.apiKeys).values({
        id: newId(), workspaceId: ws, name: "viewer", prefix: VIEWER_KEY.slice(0, 8), keyHash: sha256(VIEWER_KEY), role: "viewer", createdAt: Date.now(),
      });
      await db.insert(tables.users).values([
        { id: binh, email: `binh-${binh}@t.dev`.toLowerCase(), name: "DVHai", passwordHash: "s:h", role: "member", createdAt: Date.now() },
        { id: dai, email: `dai-${dai}@t.dev`.toLowerCase(), name: "NVLong", passwordHash: "s:h", role: "member", createdAt: Date.now() },
        { id: bac, email: `bac-${bac}@t.dev`.toLowerCase(), name: "BTDuc", passwordHash: "s:h", role: "member", createdAt: Date.now() },
      ]);
      await db.insert(tables.workspaceMembers).values([
        { id: newId(), workspaceId: ws, userId: binh, role: "member", createdAt: Date.now() },
        { id: newId(), workspaceId: ws, userId: dai, role: "member", createdAt: Date.now() },
        { id: newId(), workspaceId: ws, userId: bac, role: "member", createdAt: Date.now(), deactivatedAt: Date.now() },
      ]);
    });
    const field = await fieldRoutes.POST(
      req("/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({ entity: "deal", key: "sales_motion", label: "Loại hình bán", type: "select", options: ["Đấu thầu", "Đại lý"] }),
      }),
    );
    expect(field.status).toBe(201);

    const create = async (body: Record<string, unknown>) => {
      const res = await dealRoutes.POST(req("/api/deals", { method: "POST", body: JSON.stringify(body) }));
      expect(res.status).toBe(201);
      return (await res.json()).deal.id as string;
    };
    deals.dienluc = await create({
      name: "Điện lực Vùng 2", ownerId: binh, expectedCloseDate: Date.UTC(2026, 10, 15), custom: { sales_motion: "Đấu thầu" },
    });
    deals.fiesta = await create({
      name: "Fiesta", ownerId: dai, expectedCloseDate: Date.UTC(2027, 1, 1), custom: { sales_motion: "Đại lý" },
    });
    deals.thai = await create({ name: "Đối tác Thái", ownerId: null });

    const task = async (body: Record<string, unknown>) => {
      const res = await taskRoutes.POST(req("/api/tasks", { method: "POST", body: JSON.stringify(body) }));
      expect(res.status).toBe(201);
      return (await res.json()).task.id as string;
    };
    tasks.ask = await task({ title: "Hỏi tình trạng Điện lực Vùng 1", ownerId: binh });
    tasks.visit = await task({ title: "Khảo sát Fiesta", ownerId: dai });
    tasks.open = await task({ title: "Tìm tên đối tác Thái", ownerId: null });
  });

  it("lists one member's deals, or the ones nobody owns", async () => {
    expect(await listDeals(`ownerId=${binh}`)).toEqual([deals.dienluc]);
    expect(await listDeals("ownerId=none")).toEqual([deals.thai]);
  });

  it("narrows deals to the quarter they are expected to close in", async () => {
    expect(await listDeals("closeQuarter=2026-Q4")).toEqual([deals.dienluc]);
    expect(await listDeals("closeQuarter=2027-Q1")).toEqual([deals.fiesta]);
    expect(await listDeals(`closeQuarter=2027-Q1&ownerId=${binh}`)).toEqual([]);
  });

  it("narrows deals to one choice of a custom field", async () => {
    expect(await listDeals(`fieldKey=sales_motion&fieldValue=${encodeURIComponent("Đại lý")}`)).toEqual([deals.fiesta]);
  });

  it("lists one member's tasks, or the ones nobody owns", async () => {
    expect(await listTasks(`ownerId=${binh}`)).toEqual([tasks.ask]);
    expect(await listTasks("ownerId=none")).toEqual([tasks.open]);
  });

  it("names everyone who can own work, and on request those who left too", async () => {
    const assignees = await import("@/app/api/tasks/assignees/route");
    const names = async (url: string) =>
      ((await (await assignees.GET(req(url))).json()).assignees as { name: string; active?: boolean }[]).map(
        (a) => `${a.name}${a.active === false ? " (left)" : ""}`,
      );
    expect(await names("/api/tasks/assignees")).toEqual(["DVHai", "NVLong"]);
    expect(await names("/api/tasks/assignees?all=1")).toEqual(["BTDuc (left)", "DVHai", "NVLong"]);
  });

  it("refuses a close quarter it cannot read", async () => {
    const res = await dealRoutes.GET(req("/api/deals?closeQuarter=Q4-2026"));
    expect(res.status).toBe(400);
  });

  it("hands many deals to one member at once, each change on the deal's timeline", async () => {
    const res = await reassign("deals", { ids: [deals.dienluc, deals.thai], ownerId: dai });
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(2);
    expect(await listDeals(`ownerId=${dai}`)).toEqual([deals.dienluc, deals.fiesta, deals.thai].sort());

    const timeline = await activityRoutes.GET(req(`/api/activities?entityType=deal&entityId=${deals.dienluc}`));
    const entries = (await timeline.json()).activities as { type: string; meta: string | Record<string, unknown> }[];
    const moved = entries.find((a) => a.type === "owner_changed");
    const meta = typeof moved?.meta === "string" ? JSON.parse(moved.meta) : moved?.meta;
    expect(meta).toMatchObject({ from: "DVHai", to: "NVLong" });
  });

  it("moves nothing when one id is unknown or the new owner is not a member", async () => {
    expect((await reassign("deals", { ids: [deals.fiesta, "missing"], ownerId: binh })).status).toBe(404);
    expect((await reassign("deals", { ids: [deals.fiesta], ownerId: "stranger" })).status).toBe(400);
    expect(await listDeals(`ownerId=${dai}`)).toContain(deals.fiesta);
  });

  it("does not let a viewer hand work over", async () => {
    expect((await reassign("deals", { ids: [deals.fiesta], ownerId: binh }, VIEWER_KEY)).status).toBe(403);
  });

  it("hands many tasks to one member at once", async () => {
    const res = await reassign("tasks", { ids: [tasks.ask, tasks.open], ownerId: dai });
    expect(res.status).toBe(200);
    expect(await listTasks(`ownerId=${dai}`)).toEqual([tasks.ask, tasks.open, tasks.visit].sort());
  });
});
