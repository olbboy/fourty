import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { quarterOf } from "@/lib/forecast";

/**
 * Phase 26 (D17): an admin sets each member's Target for a quarter; the
 * report shows, per owner, the target, what was won and lost in that quarter,
 * what is open and its weighted forecast, and how much of the target is met.
 */
describe("targets per owner", () => {
  const ADMIN = "frty_targets_admin";
  const MEMBER = "frty_targets_member";
  const period = quarterOf(Date.now());
  let ws: string;
  let binh = "";
  const stages = { open: "", won: "", lost: "", prob: 0 };

  const req = (url: string, init: RequestInit = {}, key = ADMIN) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
  const setTarget = async (body: Record<string, unknown>, key = ADMIN) => {
    const route = await import("@/app/api/targets/route");
    return route.PUT(req("/api/targets", { method: "PUT", body: JSON.stringify(body) }, key));
  };
  const report = async (key = ADMIN) => {
    const route = await import("@/app/api/stats/owners/route");
    return route.GET(req(`/api/stats/owners?period=${period}`, {}, key));
  };
  const deal = async (body: Record<string, unknown>) => {
    const route = await import("@/app/api/deals/route");
    return ((await (await route.POST(req("/api/deals", { method: "POST", body: JSON.stringify(body) }))).json()).deal as { id: string }).id;
  };
  const move = async (id: string, stageId: string) => {
    const route = await import("@/app/api/deals/[id]/route");
    await route.PATCH(req(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify({ stageId }) }), { params: Promise.resolve({ id }) });
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values(
        [
          [ADMIN, "admin"],
          [MEMBER, "member"],
        ].map(([key, role]) => ({ id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: auth.sha256(key), role, createdAt: Date.now() })),
      ),
    );
    binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: ws, userId: binh, role: "member", createdAt: Date.now() });
    const reporting = await import("@/app/api/settings/reporting/route");
    await reporting.PATCH(req("/api/settings/reporting", { method: "PATCH", body: JSON.stringify({ currency: "VND" }) }));
    const pipelines = await import("@/app/api/pipelines/route");
    const list = (await (await pipelines.GET(req("/api/pipelines"))).json()).pipelines[0].stages as { id: string; type: string; winProbability: number }[];
    const open = list.find((s) => s.type === "open" && s.winProbability > 0)!;
    stages.open = open.id;
    stages.prob = open.winProbability;
    stages.won = list.find((s) => s.type === "won")!.id;
    stages.lost = list.find((s) => s.type === "lost")!.id;
  });

  it("lets only an admin set a target", async () => {
    expect((await setTarget({ userId: binh, period, amount: 1_000_000_000 }, MEMBER)).status).toBe(403);
    expect((await setTarget({ userId: binh, period, amount: 1_000_000_000 })).status).toBe(200);
    expect((await setTarget({ userId: "nobody", period, amount: 1 })).status).toBe(400);
  });

  it("shows each owner's target, won and lost in the quarter, open and weighted, and attainment", async () => {
    const won = await deal({ name: "Thắng", amount: 300_000_000, currency: "VND", ownerId: binh, stageId: stages.open });
    await move(won, stages.won);
    const lost = await deal({ name: "Thua", amount: 50_000_000, currency: "VND", ownerId: binh, stageId: stages.open });
    await move(lost, stages.lost);
    await deal({ name: "Đang mở", amount: 500_000_000, currency: "VND", ownerId: binh, stageId: stages.open, expectedCloseDate: Date.now() });

    const res = await report(MEMBER);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ period, currency: "VND" });
    const row = (body.owners as Record<string, unknown>[]).find((o) => o.ownerId === binh)!;
    expect(row).toMatchObject({
      name: "DVHai",
      target: 1_000_000_000,
      won: 300_000_000,
      wonCount: 1,
      lostCount: 1,
      open: 500_000_000,
      weighted: (500_000_000 * stages.prob) / 100,
      attainment: 0.3,
    });
  });

  it("clears a target", async () => {
    expect((await setTarget({ userId: binh, period, amount: null })).status).toBe(200);
    const row = ((await (await report()).json()).owners as Record<string, unknown>[]).find((o) => o.ownerId === binh)!;
    expect(row).toMatchObject({ target: null, attainment: null });
  });
});
