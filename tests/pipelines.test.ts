import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";

describe("pipeline and stage API", () => {
  const KEY = {
    admin: "frty_pipeline_admin",
    member: "frty_pipeline_member",
    viewer: "frty_pipeline_viewer",
    other: "frty_pipeline_other",
  } as const;

  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let pipelineRoutes: typeof import("@/app/api/pipelines/route");
  let pipelineIdRoutes: typeof import("@/app/api/pipelines/[id]/route");
  let stageRoutes: typeof import("@/app/api/pipelines/[id]/stages/route");
  let stageIdRoutes: typeof import("@/app/api/pipelines/[id]/stages/[stageId]/route");
  let dealRoutes: typeof import("@/app/api/deals/route");
  let dealIdRoutes: typeof import("@/app/api/deals/[id]/route");
  let ws: string;
  let otherWs: string;

  const req = (token: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...init,
    });

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const stageParams = (id: string, stageId: string) => ({
    params: Promise.resolve({ id, stageId }),
  });

  beforeEach(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    pipelineRoutes = await import("@/app/api/pipelines/route");
    pipelineIdRoutes = await import("@/app/api/pipelines/[id]/route");
    stageRoutes = await import("@/app/api/pipelines/[id]/stages/route");
    stageIdRoutes = await import("@/app/api/pipelines/[id]/stages/[stageId]/route");
    dealRoutes = await import("@/app/api/deals/route");
    dealIdRoutes = await import("@/app/api/deals/[id]/route");

    ws = await createWorkspace();
    otherWs = await createWorkspace();
    for (const [token, role, workspaceId] of [
      [KEY.admin, "admin", ws],
      [KEY.member, "member", ws],
      [KEY.viewer, "viewer", ws],
      [KEY.other, "admin", otherWs],
    ] as const) {
      await db.insert(tables.apiKeys).values({
        id: newId(),
        workspaceId,
        name: token,
        prefix: token.slice(0, 8),
        keyHash: sha256(token),
        role,
        createdAt: Date.now(),
      });
    }
  });

  async function createPipeline(token: string = KEY.admin, name = "Sales") {
    const res = await pipelineRoutes.POST(
      req(token, "/api/pipelines", { method: "POST", body: JSON.stringify({ name }) }),
    );
    expect(res.status).toBe(201);
    return (await res.json()).pipeline as {
      id: string;
      isDefault: number;
      stages: Array<{ id: string; order: number; type: string; winProbability: number }>;
    };
  }

  async function rowsFor(workspaceId = ws) {
    return withWorkspace(workspaceId, async () => ({
      pipelines: await db.select().from(tables.pipelines),
      stages: await db.select().from(tables.stages),
      deals: await db.select().from(tables.deals),
      audit: await db.select().from(tables.auditLog),
    }));
  }

  it("keeps GET read-only and permits viewer reads", async () => {
    const res = await pipelineRoutes.GET(req(KEY.viewer, "/api/pipelines"));
    expect(res.status).toBe(200);
    expect((await res.json()).pipelines).toEqual([]);
    expect((await rowsFor()).pipelines).toHaveLength(0);
  });

  it("creates a usable pipeline by cloning the default stages", async () => {
    const pipeline = await createPipeline(KEY.member, "Enterprise");
    expect(pipeline.stages).toHaveLength(7);
    expect(pipeline.stages.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(pipeline.stages.find((s) => s.type === "won")?.winProbability).toBe(100);
    expect(pipeline.stages.find((s) => s.type === "lost")?.winProbability).toBe(0);
    expect((await rowsFor()).audit.some((a) => a.action === "pipeline.created")).toBe(true);
  });

  it("authorizes writes and validates pipeline names", async () => {
    const denied = await pipelineRoutes.POST(
      req(KEY.viewer, "/api/pipelines", { method: "POST", body: JSON.stringify({ name: "Nope" }) }),
    );
    expect(denied.status).toBe(403);

    const invalid = await pipelineRoutes.POST(
      req(KEY.member, "/api/pipelines", { method: "POST", body: JSON.stringify({ name: "   " }) }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatch(/name/);
  });

  it("maintains one default pipeline when setting or clearing defaults", async () => {
    const first = await createPipeline(KEY.admin, "First");
    const second = await createPipeline(KEY.admin, "Second");

    const setDefault = await pipelineIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${second.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      }),
      params(second.id),
    );
    expect(setDefault.status).toBe(200);
    const rows = await rowsFor();
    expect(rows.pipelines.filter((p) => p.isDefault === 1)).toHaveLength(1);
    expect(rows.pipelines.find((p) => p.id === second.id)?.isDefault).toBe(1);
    expect(rows.pipelines.find((p) => p.id === first.id)?.isDefault).toBe(0);

    const clearDefault = await pipelineIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${second.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: false }),
      }),
      params(second.id),
    );
    expect(clearDefault.status).toBe(409);
    expect((await clearDefault.json()).error).toMatch(/default/i);
  });

  it("uses the selected default pipeline when a deal omits pipelineId", async () => {
    const first = await createPipeline(KEY.admin, "First");
    const second = await createPipeline(KEY.admin, "Second");
    const setDefault = await pipelineIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${second.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      }),
      params(second.id),
    );
    expect(setDefault.status).toBe(200);

    const created = await dealRoutes.POST(
      req(KEY.member, "/api/deals", { method: "POST", body: JSON.stringify({ name: "Default deal" }) }),
    );
    expect(created.status).toBe(201);
    const deal = (await created.json()).deal;
    expect(deal.pipelineId).toBe(second.id);
    expect(deal.stageId).toBe(second.stages[0].id);
    expect(deal.pipelineId).not.toBe(first.id);
  });

  it("adds stages, enforces stage semantics, and reorders an exact set", async () => {
    const pipeline = await createPipeline();
    const added = await stageRoutes.POST(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages`, {
        method: "POST",
        body: JSON.stringify({ name: "Review", winProbability: 60, color: "#123456" }),
      }),
      params(pipeline.id),
    );
    expect(added.status).toBe(201);
    const stage = (await added.json()).stage;
    expect(stage.order).toBe(7);

    const invalid = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "won", winProbability: 99 }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(invalid.status).toBe(400);

    const ids = [...pipeline.stages.map((s) => s.id), stage.id];
    const reorder = await stageRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages`, {
        method: "PATCH",
        body: JSON.stringify({ stageIds: [...ids].reverse() }),
      }),
      params(pipeline.id),
    );
    expect(reorder.status).toBe(200);
    const reordered = (await rowsFor()).stages
      .filter((s) => s.pipelineId === pipeline.id)
      .sort((a, b) => a.order - b.order);
    expect(reordered.map((s) => s.id)).toEqual([...ids].reverse());

    const missing = await stageRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages`, {
        method: "PATCH",
        body: JSON.stringify({ stageIds: ids.slice(1) }),
      }),
      params(pipeline.id),
    );
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toMatch(/all stages|exact/i);
  });

  it("recomputes deal scores for probability changes and protects referenced stage types", async () => {
    const pipeline = await createPipeline();
    const stage = pipeline.stages[0];
    const created = await dealRoutes.POST(
      req(KEY.member, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Scored deal", pipelineId: pipeline.id, stageId: stage.id }),
      }),
    );
    expect(created.status).toBe(201);
    const before = (await created.json()).deal;

    const probability = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ winProbability: 95 }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(probability.status).toBe(200);
    const after = (await probability.json()).stage;
    expect(after.winProbability).toBe(95);
    const dealAfterProbability = (await rowsFor()).deals.find((deal) => deal.id === before.id);
    expect(dealAfterProbability?.score).toBeGreaterThan(before.score);

    const typeConflict = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "won" }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(typeConflict.status).toBe(409);
    expect((await typeConflict.json()).error).toMatch(/deals|type/i);
    const rows = await rowsFor();
    expect(rows.stages.find((row) => row.id === stage.id)?.type).toBe("open");
  });

  it("recomputes every deal in a stage when its probability changes", async () => {
    const pipeline = await createPipeline();
    const stage = pipeline.stages[0];
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        dealRoutes.POST(
          req(KEY.member, "/api/deals", {
            method: "POST",
            body: JSON.stringify({
              name: `Bulk scored deal ${index}`,
              pipelineId: pipeline.id,
              stageId: stage.id,
            }),
          }),
        ),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const created = await Promise.all(responses.map((response) => response.json()));
    const before = new Map(created.map(({ deal }) => [deal.id, deal.score]));

    const probability = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ winProbability: 95 }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(probability.status).toBe(200);

    const rows = await rowsFor();
    for (const [dealId, score] of before) {
      expect(rows.deals.find((deal) => deal.id === dealId)?.score).toBeGreaterThan(score);
    }
  });

  it("serializes expected-close updates with probability rescoring", async () => {
    const pipeline = await createPipeline();
    const stage = pipeline.stages[0];
    const created = await dealRoutes.POST(
      req(KEY.member, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Race scored deal", pipelineId: pipeline.id, stageId: stage.id }),
      }),
    );
    expect(created.status).toBe(201);
    const deal = (await created.json()).deal;

    let signalReady!: () => void;
    let releaseLock!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holder = withWorkspace(ws, async () => {
      await db
        .select({ id: tables.deals.id })
        .from(tables.deals)
        .where(eq(tables.deals.id, deal.id))
        .for("update");
      signalReady();
      await release;
    });
    await ready;

    const expectedCloseDate = Date.now() - 86400000;
    try {
      const metadataUpdate = dealIdRoutes.PATCH(
        req(KEY.member, `/api/deals/${deal.id}`, {
          method: "PATCH",
          body: JSON.stringify({ expectedCloseDate }),
        }),
        params(deal.id),
      );
      // Queue the metadata write first while the holder owns the row. Without
      // the stage handler's initial FOR UPDATE, its stale score write can then
      // run after the metadata transaction commits.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const probabilityUpdate = stageIdRoutes.PATCH(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
          method: "PATCH",
          body: JSON.stringify({ winProbability: 95 }),
        }),
        stageParams(pipeline.id, stage.id),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseLock();
      const [probabilityResponse, metadataResponse] = await Promise.all([probabilityUpdate, metadataUpdate]);
      expect(probabilityResponse.status).toBe(200);
      expect(metadataResponse.status).toBe(200);
    } finally {
      releaseLock();
      await holder;
    }

    const rows = await rowsFor();
    const finalDeal = rows.deals.find((row) => row.id === deal.id);
    expect(rows.stages.find((row) => row.id === stage.id)?.winProbability).toBe(95);
    expect(finalDeal?.expectedCloseDate).toBe(expectedCloseDate);
    // 95 base + 6 for the created/updated activities + 8 recency
    // - 4 without contact - 15 overdue.
    expect(finalDeal?.score).toBe(90);
  });

  it("scores a stage population larger than one batch chunk", async () => {
    const pipeline = await createPipeline();
    const stage = pipeline.stages[0];
    const dealCount = 205;
    const now = Date.now();
    await withWorkspace(ws, async () => {
      await db.insert(tables.deals).values(
        Array.from({ length: dealCount }, (_, index) => ({
          id: newId(),
          name: `Chunked deal ${index}`,
          amount: 0,
          currency: "USD",
          pipelineId: pipeline.id,
          stageId: stage.id,
          stageEnteredAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      );
    });

    const probability = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ winProbability: 95 }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(probability.status).toBe(200);

    const rows = await rowsFor();
    const scored = rows.deals.filter((deal) => deal.pipelineId === pipeline.id && deal.stageId === stage.id);
    expect(scored).toHaveLength(dealCount);
    expect(scored.every((deal) => deal.score === 79)).toBe(true);
  });

  it("hides cross-workspace pipelines and stages", async () => {
    const foreign = await createPipeline(KEY.other, "Foreign");
    const res = await pipelineIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${foreign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Leaked" }),
      }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const stageRes = await stageIdRoutes.DELETE(
      req(KEY.member, `/api/pipelines/${foreign.id}/stages/${foreign.stages[0].id}`, { method: "DELETE" }),
      stageParams(foreign.id, foreign.stages[0].id),
    );
    expect(stageRes.status).toBe(404);
  });

  it("rejects deletion of defaults, referenced resources, and the final stage", async () => {
    const defaultPipeline = await createPipeline(KEY.admin, "Default");
    const otherPipeline = await createPipeline(KEY.admin, "Other");
    const referencedStage = otherPipeline.stages[0];
    await withWorkspace(ws, async () => {
      await db.insert(tables.deals).values({
        id: newId(),
        name: "In use",
        amount: 1,
        currency: "USD",
        pipelineId: otherPipeline.id,
        stageId: referencedStage.id,
        stageEnteredAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const defaultDelete = await pipelineIdRoutes.DELETE(
      req(KEY.member, `/api/pipelines/${defaultPipeline.id}`, { method: "DELETE" }),
      params(defaultPipeline.id),
    );
    expect(defaultDelete.status).toBe(409);
    expect((await defaultDelete.json()).error).toMatch(/default/i);

    const referencedPipelineDelete = await pipelineIdRoutes.DELETE(
      req(KEY.member, `/api/pipelines/${otherPipeline.id}`, { method: "DELETE" }),
      params(otherPipeline.id),
    );
    expect(referencedPipelineDelete.status).toBe(409);
    expect((await referencedPipelineDelete.json()).error).toMatch(/deal/i);

    await withWorkspace(ws, async () => {
      await db.delete(tables.deals);
    });
    const stages = [...otherPipeline.stages];
    for (const stage of stages.slice(1)) {
      const deleted = await stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${otherPipeline.id}/stages/${stage.id}`, { method: "DELETE" }),
        stageParams(otherPipeline.id, stage.id),
      );
      expect(deleted.status).toBe(200);
    }
    const finalStage = await stageIdRoutes.DELETE(
      req(KEY.member, `/api/pipelines/${otherPipeline.id}/stages/${stages[0].id}`, { method: "DELETE" }),
      stageParams(otherPipeline.id, stages[0].id),
    );
    expect(finalStage.status).toBe(409);
    expect((await finalStage.json()).error).toMatch(/last stage/i);
  });

  it("rejects deleting the final pipeline", async () => {
    const only = await createPipeline();
    const res = await pipelineIdRoutes.DELETE(
      req(KEY.admin, `/api/pipelines/${only.id}`, { method: "DELETE" }),
      params(only.id),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last pipeline|default/i);
  });

  it("serializes concurrent first-pipeline creation so only one is default", async () => {
    const results = await Promise.all([
      createPipeline(KEY.admin, "Concurrent A"),
      createPipeline(KEY.member, "Concurrent B"),
    ]);
    expect(results).toHaveLength(2);
    const rows = await rowsFor();
    expect(rows.pipelines).toHaveLength(2);
    expect(rows.pipelines.filter((pipeline) => pipeline.isDefault === 1)).toHaveLength(1);
  });

  it("serializes concurrent stage creation with contiguous orders", async () => {
    const pipeline = await createPipeline();
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        stageRoutes.POST(
          req(KEY.member, `/api/pipelines/${pipeline.id}/stages`, {
            method: "POST",
            body: JSON.stringify({ name: `Concurrent ${index}`, winProbability: 50, color: "#123456" }),
          }),
          params(pipeline.id),
        ),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const rows = await rowsFor();
    const orders = rows.stages
      .filter((stage) => stage.pipelineId === pipeline.id)
      .map((stage) => stage.order)
      .sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 13 }, (_, index) => index));
  });

  it("serializes concurrent final-stage deletion so one stage remains", async () => {
    const pipeline = await createPipeline();
    for (const stage of pipeline.stages.slice(2)) {
      const response = await stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, { method: "DELETE" }),
        stageParams(pipeline.id, stage.id),
      );
      expect(response.status).toBe(200);
    }
    const [first, second] = pipeline.stages;
    const responses = await Promise.all([
      stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${first.id}`, { method: "DELETE" }),
        stageParams(pipeline.id, first.id),
      ),
      stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${second.id}`, { method: "DELETE" }),
        stageParams(pipeline.id, second.id),
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const rows = await rowsFor();
    expect(rows.stages.filter((stage) => stage.pipelineId === pipeline.id)).toHaveLength(1);
  });

  it("serializes stage deletion against deal creation without dangling references", async () => {
    const pipeline = await createPipeline();
    const target = pipeline.stages[0];
    const [deleteResponse, createResponse] = await Promise.all([
      stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${target.id}`, { method: "DELETE" }),
        stageParams(pipeline.id, target.id),
      ),
      dealRoutes.POST(
        req(KEY.member, "/api/deals", {
          method: "POST",
          body: JSON.stringify({ name: "Concurrent deal", pipelineId: pipeline.id, stageId: target.id }),
        }),
      ),
    ]);
    const validOutcome =
      (deleteResponse.status === 200 && createResponse.status === 400) ||
      (deleteResponse.status === 409 && createResponse.status === 201);
    expect(validOutcome).toBe(true);
    const rows = await rowsFor();
    for (const deal of rows.deals) {
      expect(rows.pipelines.some((pipelineRow) => pipelineRow.id === deal.pipelineId)).toBe(true);
      expect(
        rows.stages.some((stage) => stage.id === deal.stageId && stage.pipelineId === deal.pipelineId),
      ).toBe(true);
    }
  });
});
