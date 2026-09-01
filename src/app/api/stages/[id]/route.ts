import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const patch = z.object({
  name: z.string().min(1).max(80).optional(),
  winProbability: z.number().int().min(0).max(100).optional(),
  order: z.number().int().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex colour like #a89f99")
    .optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "update");
    if (denied) return denied;
    const { id } = await params;
    const existing = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0];
    if (!existing) return apiError("Stage not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    if (Object.keys(body.data).length === 0) return json({ stage: existing });
    // Moving onto another stage's order swaps the two, so one PATCH is enough
    // to reorder and two rows never share a slot.
    const nextOrder = body.data.order;
    if (nextOrder !== undefined && nextOrder !== existing.order) {
      const occupant = (
        await db
          .select()
          .from(tables.stages)
          .where(
            and(
              eq(tables.stages.pipelineId, existing.pipelineId),
              eq(tables.stages.order, nextOrder),
              ne(tables.stages.id, existing.id),
            ),
          )
          .limit(1)
      )[0];
      if (occupant) {
        await db.update(tables.stages).set({ order: existing.order }).where(eq(tables.stages.id, occupant.id));
      }
    }
    await db.update(tables.stages).set(body.data).where(eq(tables.stages.id, id));
    await audit(auth.user?.id, "stage.updated", { objectType: "stage", objectId: id });
    const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0]!;
    return json({ stage });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "stages", "delete");
    if (denied) return denied;
    const { id } = await params;
    const existing = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0];
    if (!existing) return apiError("Stage not found", 404);
    // POST only creates open stages; Won/Lost stay so deal.won / deal.lost keep
    // their meaning. A pipeline also needs one open stage for new deals to land.
    if (existing.type === "won" || existing.type === "lost") {
      return json({ error: "Won and lost stages cannot be deleted" }, { status: 409 });
    }
    const openSiblings = await db
      .select({ id: tables.stages.id })
      .from(tables.stages)
      .where(and(eq(tables.stages.pipelineId, existing.pipelineId), eq(tables.stages.type, "open")));
    if (openSiblings.length <= 1) {
      return json({ error: "A pipeline needs at least one open stage" }, { status: 409 });
    }
    const occupied = (
      await db.select({ id: tables.deals.id }).from(tables.deals).where(eq(tables.deals.stageId, id)).limit(1)
    )[0];
    if (occupied) {
      return json({ error: "Move deals out of this stage first" }, { status: 409 });
    }
    await db.delete(tables.stages).where(eq(tables.stages.id, id));
    await audit(auth.user?.id, "stage.deleted", { objectType: "stage", objectId: id });
    return json({ ok: true });
  });
}
