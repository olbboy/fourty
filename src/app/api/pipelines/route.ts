import { asc } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json } from "@/lib/api";
import { ensureDefaultPipeline } from "@/db/seed";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  await ensureDefaultPipeline();
  const pipelines = await db.select().from(tables.pipelines);
  const stages = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
  return json({
    pipelines: pipelines.map((p) => ({
      ...p,
      stages: stages.filter((s) => s.pipelineId === p.id),
    })),
  });
}
