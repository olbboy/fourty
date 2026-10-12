import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  loadPipeline,
  loadPipelineWithStages,
  lockPipelineWorkspace,
  pipelinePatch,
} from "@/lib/services/pipelines";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "update");
    if (denied) return denied;
    const { id } = await params;
    const body = await parseBody(req, pipelinePatch);
    if (!body.ok) return body.response;
    await lockPipelineWorkspace(auth.workspaceId);
    const existing = await loadPipeline(id);
    if (!existing) return apiError("Pipeline not found", 404);

    if (body.data.isDefault === false && existing.isDefault === 1) {
      return apiError("Cannot unset the default pipeline", 409);
    }
    if (body.data.isDefault === true) {
      const pipelines = await db.select().from(tables.pipelines);
      for (const pipeline of pipelines) {
        if (pipeline.id !== id && pipeline.isDefault === 1) {
          await db
            .update(tables.pipelines)
            .set({ isDefault: 0 })
            .where(eq(tables.pipelines.id, pipeline.id));
        }
      }
    }
    await db
      .update(tables.pipelines)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.isDefault !== undefined
          ? { isDefault: body.data.isDefault ? 1 : 0 }
          : {}),
      })
      .where(eq(tables.pipelines.id, id));
    await audit(auth.user?.id, "pipeline.updated", {
      objectType: "pipeline",
      objectId: id,
      meta: { fields: Object.keys(body.data) },
    });
    const pipeline = await loadPipelineWithStages(id);
    if (!pipeline) return apiError("Pipeline not found after update", 404);
    return json({ pipeline });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "delete");
    if (denied) return denied;
    const { id } = await params;
    await lockPipelineWorkspace(auth.workspaceId);
    const existing = await loadPipeline(id);
    if (!existing) return apiError("Pipeline not found", 404);
    if (existing.isDefault === 1)
      return apiError("Cannot delete the default pipeline", 409);

    const pipelines = await db.select().from(tables.pipelines);
    if (pipelines.length <= 1)
      return apiError("Cannot delete the last pipeline", 409);
    const inUse = (
      await db
        .select({ id: tables.deals.id })
        .from(tables.deals)
        .where(eq(tables.deals.pipelineId, id))
        .limit(1)
    )[0];
    if (inUse)
      return apiError("Move deals out of this pipeline first; pipeline is referenced by deals", 409);

    await db.delete(tables.stages).where(eq(tables.stages.pipelineId, id));
    await db.delete(tables.pipelines).where(eq(tables.pipelines.id, id));
    await audit(auth.user?.id, "pipeline.deleted", {
      objectType: "pipeline",
      objectId: id,
    });
    return json({ ok: true });
  });
}
