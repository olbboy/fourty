import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  createOpenStage,
  loadPipeline,
  lockPipelineWorkspace,
  stageInput,
  stageReorder,
} from "@/lib/services/pipelines";

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

    const stage = await createOpenStage({
      pipelineId,
      name: body.data.name,
      winProbability: body.data.winProbability,
      color: body.data.color,
    });
    await audit(auth.user?.id, "stage.created", { objectType: "stage", objectId: stage.id, meta: { pipelineId } });
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
