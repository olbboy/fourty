import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  createOpenStage,
  DEFAULT_STAGE_COLOR,
  lockPipelineWorkspace,
} from "@/lib/services/pipelines";

const input = z.object({
  pipelineId: z.string().min(1),
  name: z.string().min(1).max(80),
  winProbability: z.number().int().min(0).max(100).optional().default(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex colour like #a89f99")
    .optional()
    .default(DEFAULT_STAGE_COLOR),
  // Kept for backwards-compatible request parsing; all created stages are open.
  type: z.enum(["open", "won", "lost"]).optional(),
});

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    // Stage membership/order changes must serialize with deal creation and
    // transitions, regardless of which REST path creates the stage.
    await lockPipelineWorkspace(auth.workspaceId);
    const pipeline = (
      await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, body.data.pipelineId)).limit(1)
    )[0];
    if (!pipeline) return apiError("Pipeline not found", 404);

    const stage = await createOpenStage({
      pipelineId: pipeline.id,
      name: body.data.name,
      winProbability: body.data.winProbability,
      color: body.data.color,
    });
    await audit(auth.user?.id, "stage.created", { objectType: "stage", objectId: stage.id });
    return json({ stage }, { status: 201 });
  });
}
