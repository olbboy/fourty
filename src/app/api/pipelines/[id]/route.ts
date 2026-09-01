import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const patch = z.object({
  name: z.string().min(1).max(80),
});

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "update");
    if (denied) return denied;
    const { id } = await params;
    const existing = (await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, id)).limit(1))[0];
    if (!existing) return apiError("Pipeline not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    await db.update(tables.pipelines).set({ name: body.data.name }).where(eq(tables.pipelines.id, id));
    await audit(auth.user?.id, "pipeline.updated", { objectType: "pipeline", objectId: id });
    const pipeline = (await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, id)).limit(1))[0]!;
    return json({ pipeline });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "delete");
    if (denied) return denied;
    const { id } = await params;
    const existing = (await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, id)).limit(1))[0];
    if (!existing) return apiError("Pipeline not found", 404);
    const siblings = await db.select({ id: tables.pipelines.id }).from(tables.pipelines);
    if (siblings.length <= 1) {
      return json({ error: "A workspace needs at least one pipeline" }, { status: 409 });
    }
    const occupied = (
      await db.select({ id: tables.deals.id }).from(tables.deals).where(eq(tables.deals.pipelineId, id)).limit(1)
    )[0];
    if (occupied) {
      return json({ error: "Move deals out of this pipeline first" }, { status: 409 });
    }
    await db.delete(tables.stages).where(eq(tables.stages.pipelineId, id));
    await db.delete(tables.pipelines).where(eq(tables.pipelines.id, id));
    await audit(auth.user?.id, "pipeline.deleted", { objectType: "pipeline", objectId: id });
    return json({ ok: true });
  });
}
