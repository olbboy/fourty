import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
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
    stageIdRoutes =
      await import("@/app/api/pipelines/[id]/stages/[stageId]/route");
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
      req(token, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    );
    expect(res.status).toBe(201);
    return (await res.json()).pipeline as {
      id: string;
      isDefault: number;
      stages: Array<{
        id: string;
        order: number;
        type: string;
        winProbability: number;
      }>;
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

  it("seeds the default pipeline on first GET and permits viewer reads", async () => {
    const res = await pipelineRoutes.GET(req(KEY.viewer, "/api/pipelines"));
    expect(res.status).toBe(200);
    const pipelines = (await res.json()).pipelines;
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].isDefault).toBe(1);
    expect((await rowsFor()).pipelines).toHaveLength(1);
  });

  it("creates a usable pipeline by cloning the default stages", async () => {
    const pipeline = await createPipeline(KEY.member, "Enterprise");
    expect(pipeline.stages).toHaveLength(7);
    expect(pipeline.stages.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(pipeline.stages.find((s) => s.type === "won")?.winProbability).toBe(
      100,
    );
    expect(pipeline.stages.find((s) => s.type === "lost")?.winProbability).toBe(
      0,
    );
    expect(
      (await rowsFor()).audit.some((a) => a.action === "pipeline.created"),
    ).toBe(true);
  });

  it("authorizes writes and validates pipeline names", async () => {
    const denied = await pipelineRoutes.POST(
      req(KEY.viewer, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    expect(denied.status).toBe(403);

    const invalid = await pipelineRoutes.POST(
      req(KEY.member, "/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: "   " }),
      }),
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
      req(KEY.member, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Default deal" }),
      }),
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
        body: JSON.stringify({
          name: "Review",
          winProbability: 60,
          type: "won",
          color: "#123456",
        }),
      }),
      params(pipeline.id),
    );
    expect(added.status).toBe(201);
    const stage = (await added.json()).stage;
    expect(stage.type).toBe("open");
    const currentStages = (await rowsFor()).stages
      .filter((candidate) => candidate.pipelineId === pipeline.id)
      .sort((a, b) => a.order - b.order);
    expect(stage.order).toBeLessThan(
      currentStages.find((candidate) => candidate.type === "won")!.order,
    );

    const invalid = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "won", winProbability: 99 }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(invalid.status).toBe(400);
    expect((await rowsFor()).stages.find((candidate) => candidate.id === stage.id)?.type).toBe("open");

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
        body: JSON.stringify({
          name: "Scored deal",
          pipelineId: pipeline.id,
          stageId: stage.id,
        }),
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
    const dealAfterProbability = (await rowsFor()).deals.find(
      (deal) => deal.id === before.id,
    );
    expect(dealAfterProbability?.score).toBeGreaterThan(before.score);

    const typeConflict = await stageIdRoutes.PATCH(
      req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "won" }),
      }),
      stageParams(pipeline.id, stage.id),
    );
    expect(typeConflict.status).toBe(400);
    expect((await typeConflict.json()).error).toMatch(/type.*cannot/i);
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
    const created = await Promise.all(
      responses.map((response) => response.json()),
    );
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
      expect(
        rows.deals.find((deal) => deal.id === dealId)?.score,
      ).toBeGreaterThan(score);
    }
  });

  it("serializes expected-close updates with probability rescoring", async () => {
    const pipeline = await createPipeline();
    const stage = pipeline.stages[0];
    const created = await dealRoutes.POST(
      req(KEY.member, "/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Race scored deal",
          pipelineId: pipeline.id,
          stageId: stage.id,
        }),
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
      const [probabilityResponse, metadataResponse] = await Promise.all([
        probabilityUpdate,
        metadataUpdate,
      ]);
      expect(probabilityResponse.status).toBe(200);
      expect(metadataResponse.status).toBe(200);
    } finally {
      releaseLock();
      await holder;
    }

    const rows = await rowsFor();
    const finalDeal = rows.deals.find((row) => row.id === deal.id);
    expect(rows.stages.find((row) => row.id === stage.id)?.winProbability).toBe(
      95,
    );
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
    const scored = rows.deals.filter(
      (deal) => deal.pipelineId === pipeline.id && deal.stageId === stage.id,
    );
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
      req(
        KEY.member,
        `/api/pipelines/${foreign.id}/stages/${foreign.stages[0].id}`,
        { method: "DELETE" },
      ),
      stageParams(foreign.id, foreign.stages[0].id),
    );
    expect(stageRes.status).toBe(404);
  });

  it("rejects deletion of defaults, referenced resources, terminal stages, and the final open stage", async () => {
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
      req(KEY.member, `/api/pipelines/${defaultPipeline.id}`, {
        method: "DELETE",
      }),
      params(defaultPipeline.id),
    );
    expect(defaultDelete.status).toBe(409);
    expect((await defaultDelete.json()).error).toMatch(/default/i);

    const referencedPipelineDelete = await pipelineIdRoutes.DELETE(
      req(KEY.member, `/api/pipelines/${otherPipeline.id}`, {
        method: "DELETE",
      }),
      params(otherPipeline.id),
    );
    expect(referencedPipelineDelete.status).toBe(409);
    expect((await referencedPipelineDelete.json()).error).toMatch(/deal/i);

    await withWorkspace(ws, async () => {
      await db.delete(tables.deals);
    });
    const stages = [...otherPipeline.stages];
    const openStages = stages.filter((stage) => stage.type === "open");
    for (const stage of openStages.slice(1)) {
      const deleted = await stageIdRoutes.DELETE(
        req(
          KEY.member,
          `/api/pipelines/${otherPipeline.id}/stages/${stage.id}`,
          { method: "DELETE" },
        ),
        stageParams(otherPipeline.id, stage.id),
      );
      expect(deleted.status).toBe(200);
    }
    const terminalStage = stages.find((stage) => stage.type === "won")!;
    const terminalDelete = await stageIdRoutes.DELETE(
      req(
        KEY.member,
        `/api/pipelines/${otherPipeline.id}/stages/${terminalStage.id}`,
        { method: "DELETE" },
      ),
      stageParams(otherPipeline.id, terminalStage.id),
    );
    expect(terminalDelete.status).toBe(409);
    expect((await terminalDelete.json()).error).toMatch(/Won and lost/i);

    const finalOpen = openStages[0];
    const finalStage = await stageIdRoutes.DELETE(
      req(
        KEY.member,
        `/api/pipelines/${otherPipeline.id}/stages/${finalOpen.id}`,
        { method: "DELETE" },
      ),
      stageParams(otherPipeline.id, finalOpen.id),
    );
    expect(finalStage.status).toBe(409);
    expect((await finalStage.json()).error).toMatch(/at least one open stage/i);
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
    expect(
      rows.pipelines.filter((pipeline) => pipeline.isDefault === 1),
    ).toHaveLength(1);
  });

  it("serializes concurrent stage creation with contiguous orders", async () => {
    const pipeline = await createPipeline();
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        stageRoutes.POST(
          req(KEY.member, `/api/pipelines/${pipeline.id}/stages`, {
            method: "POST",
            body: JSON.stringify({
              name: `Concurrent ${index}`,
              winProbability: 50,
              color: "#123456",
            }),
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
    const openStages = pipeline.stages.filter((stage) => stage.type === "open");
    for (const stage of openStages.slice(2)) {
      const response = await stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
          method: "DELETE",
        }),
        stageParams(pipeline.id, stage.id),
      );
      expect(response.status).toBe(200);
    }
    const [first, second] = openStages;
    const responses = await Promise.all([
      stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${first.id}`, {
          method: "DELETE",
        }),
        stageParams(pipeline.id, first.id),
      ),
      stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${second.id}`, {
          method: "DELETE",
        }),
        stageParams(pipeline.id, second.id),
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const rows = await rowsFor();
    const remaining = rows.stages.filter((stage) => stage.pipelineId === pipeline.id);
    expect(remaining.filter((stage) => stage.type === "open")).toHaveLength(1);
    expect(remaining.filter((stage) => stage.type === "won" || stage.type === "lost")).toHaveLength(2);
  });

  it("serializes stage deletion against deal creation without dangling references", async () => {
    const pipeline = await createPipeline();
    const target = pipeline.stages[0];
    const [deleteResponse, createResponse] = await Promise.all([
      stageIdRoutes.DELETE(
        req(KEY.member, `/api/pipelines/${pipeline.id}/stages/${target.id}`, {
          method: "DELETE",
        }),
        stageParams(pipeline.id, target.id),
      ),
      dealRoutes.POST(
        req(KEY.member, "/api/deals", {
          method: "POST",
          body: JSON.stringify({
            name: "Concurrent deal",
            pipelineId: pipeline.id,
            stageId: target.id,
          }),
        }),
      ),
    ]);
    const validOutcome =
      (deleteResponse.status === 200 && createResponse.status === 400) ||
      (deleteResponse.status === 409 && createResponse.status === 201);
    expect(validOutcome).toBe(true);
    const rows = await rowsFor();
    for (const deal of rows.deals) {
      expect(
        rows.pipelines.some(
          (pipelineRow) => pipelineRow.id === deal.pipelineId,
        ),
      ).toBe(true);
      expect(
        rows.stages.some(
          (stage) =>
            stage.id === deal.stageId && stage.pipelineId === deal.pipelineId,
        ),
      ).toBe(true);
    }
  });
});

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

  const hdr = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  });
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
    const lead = pipeline.stages.find(
      (s: { name: string }) => s.name === "Lead",
    );
    expect(lead).toBeDefined();
    leadId = lead.id;
  });

  it("looking up a missing pipeline does not seed a default on an empty workspace", async () => {
    const { withWorkspace } = await import("@/db");
    const { getPipelineWithStages } = await import("@/lib/services/pipelines");
    const empty = await createWorkspace();
    await withWorkspace(empty, async () => {
      expect(await getPipelineWithStages("no-such-pipeline")).toBeNull();
      expect(await db.select().from(tables.pipelines)).toEqual([]);
    });
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
    const again = (await listed.json()).pipelines[0].stages.find(
      (s: { id: string }) => s.id === leadId,
    );
    expect(again.name).toBe("Discovery");
    expect(again.winProbability).toBe(15);
  });

  it("keeps a stage type immutable on the flat route", async () => {
    const res = await stageRoutes.PATCH(
      req(ADMIN, `/api/stages/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "won" }),
      }),
      idParams(leadId),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/type.*cannot/i);

    const listed = await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"));
    const stage = (await listed.json()).pipelines[0].stages.find(
      (candidate: { id: string }) => candidate.id === leadId,
    );
    expect(stage.type).toBe("open");
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
    const again = (await listed.json()).pipelines[0].stages.find(
      (s: { id: string }) => s.id === leadId,
    );
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

    const again = (
      await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()
    ).pipelines[0].stages
      .slice()
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order);
    expect(again[0].id).toBe(second.id);
    expect(again[1].id).toBe(first.id);
  });

  it("adds an open stage before the first won/lost slot", async () => {
    const before = (
      await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()
    ).pipelines[0].stages as { id: string; order: number; type: string }[];

    const res = await stageCreate.POST(
      req(ADMIN, "/api/stages", {
        method: "POST",
        body: JSON.stringify({
          pipelineId,
          name: "Contract",
          winProbability: 90,
          type: "lost",
          color: "#445566",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const stage = (await res.json()).stage;
    expect(stage.name).toBe("Contract");
    expect(stage.type).toBe("open");
    expect(stage.winProbability).toBe(90);
    expect(stage.color).toBe("#445566");

    const again = (
      (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json())
        .pipelines[0].stages as {
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
    const listed = (
      await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()
    ).pipelines[0].stages as { id: string; name: string; type: string }[];
    const contract = listed.find((s) => s.name === "Contract");
    expect(contract).toBeDefined();

    const gone = await stageRoutes.DELETE(
      req(ADMIN, `/api/stages/${contract!.id}`, { method: "DELETE" }),
      idParams(contract!.id),
    );
    expect(gone.status).toBe(200);

    const won = listed.find((s) => s.type === "won")!;
    const refuseWon = await stageRoutes.DELETE(
      req(ADMIN, `/api/stages/${won.id}`, { method: "DELETE" }),
      idParams(won.id),
    );
    expect(refuseWon.status).toBe(409);
    expect((await refuseWon.json()).error).toMatch(/Won and lost/);

    const created = await dealRoutes.POST(
      req(ADMIN, "/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Stuck in discovery", stageId: leadId }),
      }),
    );
    expect(created.status).toBe(201);
    const occupied = await stageRoutes.DELETE(
      req(ADMIN, `/api/stages/${leadId}`, { method: "DELETE" }),
      idParams(leadId),
    );
    expect(occupied.status).toBe(409);
    expect((await occupied.json()).error).toMatch(/Move deals/);

    const remaining = (
      (await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json())
        .pipelines[0].stages as {
        id: string;
        type: string;
      }[]
    ).filter((s) => s.type === "open" && s.id !== leadId);
    for (const s of remaining) {
      const res = await stageRoutes.DELETE(
        req(ADMIN, `/api/stages/${s.id}`, { method: "DELETE" }),
        idParams(s.id),
      );
      expect(res.status).toBe(200);
    }
    const last = await stageRoutes.DELETE(
      req(ADMIN, `/api/stages/${leadId}`, { method: "DELETE" }),
      idParams(leadId),
    );
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
    const res = await stageRoutes.DELETE(
      req(VIEWER, `/api/stages/${leadId}`, { method: "DELETE" }),
      idParams(leadId),
    );
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
    expect(
      pipeline.stages.some((s: { type: string }) => s.type === "won"),
    ).toBe(true);
    expect(
      pipeline.stages.some((s: { type: string }) => s.type === "lost"),
    ).toBe(true);

    const listed = (
      await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()
    ).pipelines as {
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
    expect(
      pipeline.stages.some((s: { id: string }) => s.id === deal.stageId),
    ).toBe(true);
  });

  it("renames a pipeline and deletes an empty extra one", async () => {
    const listed = (
      await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()
    ).pipelines as {
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
    const after = (
      await (await pipelineRoutes.GET(req(ADMIN, "/api/pipelines"))).json()
    ).pipelines as {
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
