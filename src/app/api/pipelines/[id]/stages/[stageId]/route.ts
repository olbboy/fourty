import { and, asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  loadPipeline,
  lockPipelineWorkspace,
  resolveStageValues,
  stageDeletionConflict,
  stagePatch,
  type StageType,
} from "@/lib/services/pipelines";
import { recomputeDealScores } from "@/lib/services/deal-score";

type Params = { params: Promise<{ id: string; stageId: string }> };

async function loadStage(pipelineId: string, stageId: string) {
  return (
    await db
      .select()
      .from(tables.stages)
      .where(and(eq(tables.stages.id, stageId), eq(tables.stages.pipelineId, pipelineId)))
      .limit(1)
  )[0];
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "update");
    if (denied) return denied;
    const { id: pipelineId, stageId } = await params;
    const body = await parseBody(req, stagePatch);
    if (!body.ok) return body.response;
    if (body.data.type !== undefined) {
      return apiError("Stage type cannot be changed");
    }
    await lockPipelineWorkspace(auth.workspaceId);
    const pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return apiError("Pipeline not found", 404);
    const existing = await loadStage(pipelineId, stageId);
    if (!existing) return apiError("Stage not found", 404);
    const resolved = resolveStageValues(
      { winProbability: body.data.winProbability },
      { type: existing.type as StageType, winProbability: existing.winProbability },
    );
    if (resolved.error) return apiError(resolved.error);
    const probabilityChanged = resolved.winProbability !== existing.winProbability;
    // Lock affected deals before the probability update and keep those row
    // locks through the stage update and score recomputation. Deal metadata
    // updates intentionally do not take the workspace advisory lock; this row
    // lock makes either operation observe the other's committed state.
    const dealIds = probabilityChanged
      ? (
          await db
            .select({ id: tables.deals.id })
            .from(tables.deals)
            .where(eq(tables.deals.stageId, stageId))
            .for("update", { of: tables.deals })
        ).map((deal) => deal.id)
      : [];
    await db
      .update(tables.stages)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.color !== undefined ? { color: body.data.color } : {}),
        type: resolved.type,
        winProbability: resolved.winProbability,
      })
      .where(and(eq(tables.stages.id, stageId), eq(tables.stages.pipelineId, pipelineId)));
    if (probabilityChanged) {
      await recomputeDealScores(dealIds);
    }
    await audit(auth.user?.id, "stage.updated", {
      objectType: "stage",
      objectId: stageId,
      meta: { pipelineId, fields: Object.keys(body.data) },
    });
    const stage = await loadStage(pipelineId, stageId);
    if (!stage) return apiError("Stage not found after update", 404);
    return json({ stage });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "delete");
    if (denied) return denied;
    const { id: pipelineId, stageId } = await params;
    await lockPipelineWorkspace(auth.workspaceId);
    const pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return apiError("Pipeline not found", 404);
    const existing = await loadStage(pipelineId, stageId);
    if (!existing) return apiError("Stage not found", 404);
    const stages = await db
      .select({ id: tables.stages.id, type: tables.stages.type })
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, pipelineId));
    const openStageCount = stages.filter((stage) => stage.type === "open").length;
    const conflict = stageDeletionConflict(existing.type as StageType, openStageCount);
    if (conflict) return apiError(conflict, 409);
    const inUse = (
      await db
        .select({ id: tables.deals.id })
        .from(tables.deals)
        .where(and(eq(tables.deals.pipelineId, pipelineId), eq(tables.deals.stageId, stageId)))
        .limit(1)
    )[0];
    if (inUse) return apiError("Cannot delete a stage referenced by deals", 409);

    await db
      .delete(tables.stages)
      .where(and(eq(tables.stages.id, stageId), eq(tables.stages.pipelineId, pipelineId)));
    const remaining = await db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, pipelineId))
      .orderBy(asc(tables.stages.order));
    for (let order = 0; order < remaining.length; order++) {
      if (remaining[order].order !== order) {
        await db.update(tables.stages).set({ order }).where(eq(tables.stages.id, remaining[order].id));
      }
    }
    await audit(auth.user?.id, "stage.deleted", {
      objectType: "stage",
      objectId: stageId,
      meta: { pipelineId },
    });
    return json({ ok: true });
  });
}
