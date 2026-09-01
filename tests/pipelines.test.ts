import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Pipeline stages are documented as renameable, reorderable, and re-weightable
 * from Settings. GET /api/pipelines lists them; PATCH /api/stages/{id} is the
 * write path for rename/reorder, POST /api/stages adds an extra open stage.
 * Setting `order` swaps with the occupant.
 */
describe("pipeline stage updates (real handlers + Postgres)", () => {
  const ADMIN = "frty_pipeline_admin";
  const VIEWER = "frty_pipeline_viewer";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let pipelineRoutes: typeof import("@/app/api/pipelines/route");
  let stageRoutes: typeof import("@/app/api/stages/[id]/route");
  let stageCreate: typeof import("@/app/api/stages/route");
  let dealRoutes: typeof import("@/app/api/deals/route");
  let pipelineIdRoutes: typeof import("@/app/api/pipelines/[id]/route");
  let leadId: string;
  let pipelineId: string;

  const hdr = (token: string) => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });
  const req = (token: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: hdr(token), ...init });
  const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    pipelineRoutes = await import("@/app/api/pipelines/route");
    stageRoutes = await import("@/app/api/stages/[id]/route");
    stageCreate = await import("@/app/api/stages/route");
    dealRoutes = await import("@/app/api/deals/route");
    pipelineIdRoutes = await import("@/app/api/pipelines/[id]/route");

    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values([
      {
        id: newId(),
        workspaceId: ws,
        name: "admin",
        prefix: ADMIN.slice(0, 8),
        keyHash: sha256(ADMIN),
        role: "admin",
        createdAt: Date.now(),
      },
      {
        id: newId(),
        workspaceId: ws,
        name: "viewer",
        prefix: VIEWER.slice(0, 8),
        keyHash: sha256(VIEWER),
        role: "viewer",
        createdAt: Date.now(),
      },
    ]);

    const listed = await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"));
    expect(listed.status).toBe(200);
    const pipeline = (await listed.json()).pipelines[0];
    pipelineId = pipeline.id;
    const lead = pipeline.stages.find((s: { name: string }) => s.name === "Lead");
    expect(lead).toBeDefined();
    leadId = lead.id;
  });

  it("renames a stage and updates its win probability", async () => {
    const res = await stageRoutes.PATCH(
      req(ADMIN, `/api/stages/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Discovery", winProbability: 15 }),
      }),
      idParams(leadId),
    );
    expect(res.status).toBe(200);
    const stage = (await res.json()).stage;
    expect(stage.name).toBe("Discovery");
    expect(stage.winProbability).toBe(15);

    const listed = await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"));
    const again = (await listed.json()).pipelines[0].stages.find((s: { id: string }) => s.id === leadId);
    expect(again.name).toBe("Discovery");
    expect(again.winProbability).toBe(15);
  });

  it("recolours a stage and refuses a non-hex colour", async () => {
    const res = await stageRoutes.PATCH(
      req(ADMIN, `/api/stages/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ color: "#112233" }),
      }),
      idParams(leadId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).stage.color).toBe("#112233");

    const listed = await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"));
    const again = (await listed.json()).pipelines[0].stages.find((s: { id: string }) => s.id === leadId);
    expect(again.color).toBe("#112233");

    const bad = await stageRoutes.PATCH(
      req(ADMIN, `/api/stages/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ color: "red" }),
      }),
      idParams(leadId),
    );
    expect(bad.status).toBe(400);
  });

  it("refuses a win probability outside 0–100", async () => {
    const res = await stageRoutes.PATCH(
      req(ADMIN, `/api/stages/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ winProbability: 140 }),
      }),
      idParams(leadId),
    );
    expect(res.status).toBe(400);
  });

  it("swaps order with the stage that already holds that slot", async () => {
    const listed = await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"));
    const stages = (await listed.json()).pipelines[0].stages
      .slice()
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order);
    const first = stages[0];
    const second = stages[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const res = await stageRoutes.PATCH(
      req(ADMIN, `/api/stages/${first.id}`, {
        method: "PATCH",
        body: JSON.stringify({ order: second.order }),
      }),
      idParams(first.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).stage.order).toBe(second.order);

    const again = (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines[0].stages
      .slice()
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order);
    expect(again[0].id).toBe(second.id);
    expect(again[1].id).toBe(first.id);
  });

  it("adds an open stage before the first won/lost slot", async () => {
    const before = (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines[0]
      .stages as { id: string; order: number; type: string }[];

    const res = await stageCreate.POST(
      req(ADMIN, "/api/stages", {
        method: "POST",
        body: JSON.stringify({ pipelineId, name: "Contract", winProbability: 90, color: "#445566" }),
      }),
    );
    expect(res.status).toBe(201);
    const stage = (await res.json()).stage;
    expect(stage.name).toBe("Contract");
    expect(stage.type).toBe("open");
    expect(stage.winProbability).toBe(90);
    expect(stage.color).toBe("#445566");

    const again = (
      (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines[0].stages as {
        id: string;
        order: number;
        type: string;
      }[]
    )
      .slice()
      .sort((a, b) => a.order - b.order);
    expect(again).toHaveLength(before.length + 1);
    const added = again.find((s) => s.id === stage.id)!;
    const won = again.find((s) => s.type === "won")!;
    expect(added.order).toBeLessThan(won.order);
  });

  it("deletes an empty open stage and refuses won/lost, occupied, and the last open", async () => {
    const listed = (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines[0]
      .stages as { id: string; name: string; type: string }[];
    const contract = listed.find((s) => s.name === "Contract");
    expect(contract).toBeDefined();

    const gone = await stageRoutes.DELETE(req(ADMIN, `/api/stages/${contract!.id}`, { method: "DELETE" }), idParams(contract!.id));
    expect(gone.status).toBe(200);

    const won = listed.find((s) => s.type === "won")!;
    const refuseWon = await stageRoutes.DELETE(req(ADMIN, `/api/stages/${won.id}`, { method: "DELETE" }), idParams(won.id));
    expect(refuseWon.status).toBe(409);
    expect((await refuseWon.json()).error).toMatch(/Won and lost/);

    const created = await dealRoutes.POST(
      req(ADMIN, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Stuck in discovery", stageId: leadId }),
      }),
    );
    expect(created.status).toBe(201);
    const occupied = await stageRoutes.DELETE(req(ADMIN, `/api/stages/${leadId}`, { method: "DELETE" }), idParams(leadId));
    expect(occupied.status).toBe(409);
    expect((await occupied.json()).error).toMatch(/Move deals/);

    const remaining = (
      (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines[0].stages as {
        id: string;
        type: string;
      }[]
    ).filter((s) => s.type === "open" && s.id !== leadId);
    for (const s of remaining) {
      const res = await stageRoutes.DELETE(req(ADMIN, `/api/stages/${s.id}`, { method: "DELETE" }), idParams(s.id));
      expect(res.status).toBe(200);
    }
    const last = await stageRoutes.DELETE(req(ADMIN, `/api/stages/${leadId}`, { method: "DELETE" }), idParams(leadId));
    expect(last.status).toBe(409);
    expect((await last.json()).error).toMatch(/at least one open stage/);
  });

  it("forbids a viewer from adding a stage", async () => {
    const res = await stageCreate.POST(
      req(VIEWER, "/api/stages", {
        method: "POST",
        body: JSON.stringify({ pipelineId, name: "Nope" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("forbids a viewer from deleting a stage", async () => {
    const res = await stageRoutes.DELETE(req(VIEWER, `/api/stages/${leadId}`, { method: "DELETE" }), idParams(leadId));
    expect(res.status).toBe(403);
  });

  it("adds a second 7-stage pipeline and lands a deal on it", async () => {
    const res = await pipelineRoutes.POST(
      req(ADMIN, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: "Renewals" }),
      }),
    );
    expect(res.status).toBe(201);
    const pipeline = (await res.json()).pipeline;
    expect(pipeline.name).toBe("Renewals");
    expect(pipeline.isDefault).toBe(0);
    expect(pipeline.stages).toHaveLength(7);
    expect(pipeline.stages.some((s: { type: string }) => s.type === "won")).toBe(true);
    expect(pipeline.stages.some((s: { type: string }) => s.type === "lost")).toBe(true);

    const listed = (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines as {
      id: string;
    }[];
    expect(listed).toHaveLength(2);

    const dealRes = await dealRoutes.POST(
      req(ADMIN, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Renewal pack", pipelineId: pipeline.id }),
      }),
    );
    expect(dealRes.status).toBe(201);
    const deal = (await dealRes.json()).deal;
    expect(deal.pipelineId).toBe(pipeline.id);
    expect(pipeline.stages.some((s: { id: string }) => s.id === deal.stageId)).toBe(true);
  });

  it("renames a pipeline and deletes an empty extra one", async () => {
    const listed = (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines as {
      id: string;
      name: string;
    }[];
    const renewals = listed.find((p) => p.name === "Renewals");
    expect(renewals).toBeDefined();

    const renamed = await pipelineIdRoutes.PATCH(
      req(ADMIN, `/api/pipelines/${renewals!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Expansions" }),
      }),
      idParams(renewals!.id),
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).pipeline.name).toBe("Expansions");

    const occupied = await pipelineIdRoutes.DELETE(
      req(ADMIN, `/api/pipelines/${renewals!.id}`, { method: "DELETE" }),
      idParams(renewals!.id),
    );
    expect(occupied.status).toBe(409);
    expect((await occupied.json()).error).toMatch(/Move deals/);

    const created = await pipelineRoutes.POST(
      req(ADMIN, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: "Empty board" }),
      }),
    );
    expect(created.status).toBe(201);
    const emptyId = (await created.json()).pipeline.id as string;
    const gone = await pipelineIdRoutes.DELETE(
      req(ADMIN, `/api/pipelines/${emptyId}`, { method: "DELETE" }),
      idParams(emptyId),
    );
    expect(gone.status).toBe(200);
    const after = (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()).pipelines as {
      id: string;
    }[];
    expect(after.some((p) => p.id === emptyId)).toBe(false);
    expect(after.length).toBeGreaterThanOrEqual(2);
  });

  it("forbids a viewer from adding a pipeline", async () => {
    const res = await pipelineRoutes.POST(
      req(VIEWER, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("forbids a viewer from renaming a pipeline", async () => {
    const res = await pipelineIdRoutes.PATCH(
      req(VIEWER, `/api/pipelines/${pipelineId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Nope" }),
      }),
      idParams(pipelineId),
    );
    expect(res.status).toBe(403);
  });

  it("forbids a viewer from renaming a stage", async () => {
    const res = await stageRoutes.PATCH(
      req(VIEWER, `/api/stages/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Nope" }),
      }),
      idParams(leadId),
    );
    expect(res.status).toBe(403);
  });
});
