import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";

const input = z.object({
  pipelineId: z.string().min(1),
  name: z.string().min(1).max(80),
  winProbability: z.number().int().min(0).max(100).optional().default(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex colour like #a89f99")
    .optional()
    .default("#a89f99"),
});

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    const pipeline = (
      await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, body.data.pipelineId)).limit(1)
    )[0];
    if (!pipeline) return apiError("Pipeline not found", 404);

    const siblings = await db.select().from(tables.stages).where(eq(tables.stages.pipelineId, pipeline.id));
    const firstClosed = siblings
      .filter((s) => s.type === "won" || s.type === "lost")
      .sort((a, b) => a.order - b.order)[0];
    const insertOrder =
      firstClosed !== undefined
        ? firstClosed.order
        : siblings.reduce((m, s) => Math.max(m, s.order), -1) + 1;

    // Extra stages are open. Land them before Won/Lost so the board keeps
    // closed columns at the end; the caller can still reorder afterwards.
    if (firstClosed) {
      await db
        .update(tables.stages)
        .set({ order: sql`${tables.stages.order} + 1` })
        .where(and(eq(tables.stages.pipelineId, pipeline.id), gte(tables.stages.order, insertOrder)));
    }

    const id = newId();
    await db.insert(tables.stages).values({
      id,
      pipelineId: pipeline.id,
      name: body.data.name,
      order: insertOrder,
      winProbability: body.data.winProbability,
      type: "open",
      color: body.data.color,
    });
    await audit(auth.user?.id, "stage.created", { objectType: "stage", objectId: id });
    const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0]!;
    return json({ stage }, { status: 201 });
  });
}
