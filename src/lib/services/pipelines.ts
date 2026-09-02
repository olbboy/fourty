import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { ensureDefaultPipeline } from "@/db/seed";

export async function listPipelinesWithStages() {
  await ensureDefaultPipeline();
  const pipelines = await db.select().from(tables.pipelines);
  const stages = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
  return pipelines.map((p) => ({
    ...p,
    stages: stages.filter((s) => s.pipelineId === p.id),
  }));
}

/** Lookup one pipeline. Does not seed a default — a miss is a miss. */
export async function getPipelineWithStages(id: string) {
  const pipeline = (
    await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, id)).limit(1)
  )[0];
  if (!pipeline) return null;
  const stages = await db
    .select()
    .from(tables.stages)
    .where(eq(tables.stages.pipelineId, id))
    .orderBy(asc(tables.stages.order));
  return { ...pipeline, stages };
}

export async function listStages(pipelineId?: string) {
  if (pipelineId) {
    return db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, pipelineId))
      .orderBy(asc(tables.stages.order));
  }
  await ensureDefaultPipeline();
  return db.select().from(tables.stages).orderBy(asc(tables.stages.order));
}
