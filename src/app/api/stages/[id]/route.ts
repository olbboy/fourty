import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  lockPipelineWorkspace,
  resolveStageValues,
  stageDeletionConflict,
  type StageType,
} from "@/lib/services/pipelines";
import { recomputeDealScores } from "@/lib/services/deal-score";

type Params = { params: Promise<{ id: string }> };

const patch = z.object({
  name: z.string().min(1).max(80).optional(),
  winProbability: z.number().int().min(0).max(100).optional(),
  type: z.enum(["open", "won", "lost"]).optional(),
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
    let existing = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0];
    if (!existing) return apiError("Stage not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    if (body.data.type !== undefined) {
      return apiError("Stage type cannot be changed");
    }
    if (Object.keys(body.data).length === 0) return json({ stage: existing });
    const membershipChanged =
      body.data.order !== undefined ||
      body.data.winProbability !== undefined;
    if (membershipChanged) {
      await lockPipelineWorkspace(auth.workspaceId);
      existing = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0];
      if (!existing) return apiError("Stage not found", 404);
    }

    // Terminal stage probabilities are canonical across both stage REST
    // routes. Stage types are immutable, and probability changes rescore every
    // affected deal before commit.
    const resolved = resolveStageValues(
      { winProbability: body.data.winProbability },
      { type: existing.type as StageType, winProbability: existing.winProbability },
    );
    if (resolved.error) return apiError(resolved.error);
    const probabilityChanged = resolved.winProbability !== existing.winProbability;
    const dealIds = probabilityChanged
      ? (
          await db
            .select({ id: tables.deals.id })
            .from(tables.deals)
            .where(eq(tables.deals.stageId, id))
            .for("update", { of: tables.deals })
        ).map((deal) => deal.id)
      : [];
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
    const { order, ...fields } = body.data;
    await db
      .update(tables.stages)
      .set({
        ...fields,
        type: resolved.type,
        winProbability: resolved.winProbability,
        ...(order !== undefined ? { order } : {}),
      })
      .where(eq(tables.stages.id, id));
    if (probabilityChanged) await recomputeDealScores(dealIds);
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
    await lockPipelineWorkspace(auth.workspaceId);
    const existing = (await db.select().from(tables.stages).where(eq(tables.stages.id, id)).limit(1))[0];
    if (!existing) return apiError("Stage not found", 404);
    // POST only creates open stages; Won/Lost stay so deal.won / deal.lost keep
    // their meaning. A pipeline also needs one open stage for new deals to land.
    const openSiblings = await db
      .select({ id: tables.stages.id })
      .from(tables.stages)
      .where(and(eq(tables.stages.pipelineId, existing.pipelineId), eq(tables.stages.type, "open")));
    const conflict = stageDeletionConflict(existing.type as StageType, openSiblings.length);
    if (conflict) return apiError(conflict, 409);
    const occupied = (
      await db.select({ id: tables.deals.id }).from(tables.deals).where(eq(tables.deals.stageId, id)).limit(1)
    )[0];
    if (occupied) {
      return json({ error: "Move deals out of this stage first" }, { status: 409 });
    }
    await db.delete(tables.stages).where(eq(tables.stages.id, id));
    const remaining = await db
      .select({ id: tables.stages.id, order: tables.stages.order })
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, existing.pipelineId))
      .orderBy(tables.stages.order);
    for (let order = 0; order < remaining.length; order++) {
      if (remaining[order].order !== order) {
        await db.update(tables.stages).set({ order }).where(eq(tables.stages.id, remaining[order].id));
      }
    }
    await audit(auth.user?.id, "stage.deleted", { objectType: "stage", objectId: id });
    return json({ ok: true });
  });
}
