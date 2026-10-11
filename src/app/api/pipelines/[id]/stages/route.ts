import { asc, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { loadPipeline, lockPipelineWorkspace, stageInput, stageReorder, resolveStageValues } from "@/lib/pipelines";
import { newId } from "@/lib/id";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "create");
    if (denied) return denied;
    const { id: pipelineId } = await params;
    const body = await parseBody(req, stageInput);
    if (!body.ok) return body.response;
    await lockPipelineWorkspace(auth.workspaceId);
    const pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return apiError("Pipeline not found", 404);

    const resolved = resolveStageValues(body.data);
    if (resolved.error) return apiError(resolved.error);
    const last = (
      await db
        .select({ order: tables.stages.order })
        .from(tables.stages)
        .where(eq(tables.stages.pipelineId, pipelineId))
        .orderBy(desc(tables.stages.order))
        .limit(1)
    )[0];
    const stageId = newId();
    await db.insert(tables.stages).values({
      id: stageId,
      pipelineId,
      name: body.data.name,
      order: (last?.order ?? -1) + 1,
      winProbability: resolved.winProbability,
      type: resolved.type,
      color: body.data.color ?? "#6366f1",
    });
    await audit(auth.user?.id, "stage.created", { objectType: "stage", objectId: stageId, meta: { pipelineId } });
    const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId)).limit(1))[0];
    if (!stage) return apiError("Stage not found after creation", 500);
    return json({ stage }, { status: 201 });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "update");
    if (denied) return denied;
    const { id: pipelineId } = await params;
    const body = await parseBody(req, stageReorder);
    if (!body.ok) return body.response;
    await lockPipelineWorkspace(auth.workspaceId);
    const pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return apiError("Pipeline not found", 404);

    const current = await db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, pipelineId))
      .orderBy(asc(tables.stages.order));
    const currentIds = new Set(current.map((stage) => stage.id));
    const requestedIds = body.data.stageIds;
    if (
      requestedIds.length !== current.length ||
      new Set(requestedIds).size !== requestedIds.length ||
      requestedIds.some((stageId) => !currentIds.has(stageId))
    ) {
      return apiError("stageIds must contain all stages exactly once");
    }
    // withAuth already provides the workspace transaction; this nested
    // transaction is a savepoint so every order update rolls back together if
    // one statement fails while retaining the outer RLS GUC.
    await db.transaction(async (tx) => {
      for (let order = 0; order < requestedIds.length; order++) {
        await tx
          .update(tables.stages)
          .set({ order })
          .where(eq(tables.stages.id, requestedIds[order]));
      }
    });
    await audit(auth.user?.id, "stages.reordered", {
      objectType: "pipeline",
      objectId: pipelineId,
      meta: { stageIds: requestedIds },
    });
    const stages = await db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, pipelineId))
      .orderBy(asc(tables.stages.order));
    return json({ stages });
  });
}
