import { asc } from "drizzle-orm";
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

export async function getPipelineWithStages(id: string) {
  const all = await listPipelinesWithStages();
  return all.find((p) => p.id === id) ?? null;
}

export async function listStages(pipelineId?: string) {
  await ensureDefaultPipeline();
  const rows = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
  return pipelineId ? rows.filter((s) => s.pipelineId === pipelineId) : rows;
}
