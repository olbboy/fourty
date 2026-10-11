import { asc } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/id";
import { DEFAULT_STAGES } from "@/db/seed";
import { loadPipelineWithStages, lockPipelineWorkspace, pipelineInput } from "@/lib/pipelines";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "read");
    if (denied) return denied;
    const pipelines = await db.select().from(tables.pipelines).orderBy(asc(tables.pipelines.createdAt));
    const stages = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
    return json({
      pipelines: pipelines.map((pipeline) => ({
        ...pipeline,
        stages: stages.filter((stage) => stage.pipelineId === pipeline.id),
      })),
    });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "create");
    if (denied) return denied;
    const body = await parseBody(req, pipelineInput);
    if (!body.ok) return body.response;
    await lockPipelineWorkspace(auth.workspaceId);

    const existing = await db.select().from(tables.pipelines);
    const isDefault = existing.length === 0 || !existing.some((pipeline) => pipeline.isDefault === 1) ? 1 : 0;
    const id = newId();
    const now = Date.now();
    await db.insert(tables.pipelines).values({
      id,
      name: body.data.name,
      isDefault,
      createdAt: now,
    });
    for (let order = 0; order < DEFAULT_STAGES.length; order++) {
      const stage = DEFAULT_STAGES[order];
      await db.insert(tables.stages).values({
        id: newId(),
        pipelineId: id,
        name: stage.name,
        order,
        winProbability: stage.winProbability,
        type: stage.type,
        color: stage.color,
      });
    }
    await audit(auth.user?.id, "pipeline.created", { objectType: "pipeline", objectId: id });
    const pipeline = await loadPipelineWithStages(id);
    if (!pipeline) return apiError("Pipeline not found after creation", 500);
    return json({ pipeline }, { status: 201 });
  });
}
