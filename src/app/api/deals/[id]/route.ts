import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { dispatchEvent } from "@/lib/workflows/engine";
import { recomputeDealScore } from "@/lib/services/deal-score";
import { dealPatch } from "@/lib/validators";
import { loadFieldPolicy, redact, blockedWrites } from "@/lib/field-permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const { id } = await params;
  const row = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
  if (!row) return apiError("Deal not found", 404);
  const policy = await loadFieldPolicy(auth.role);
  return json({ deal: redact(policy, "deals", { ...row, custom: JSON.parse(row.custom) }) });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "deals", "update");
  if (denied) return denied;
  const { id } = await params;
  const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
  if (!existing) return apiError("Deal not found", 404);

  const body = await parseBody(req, dealPatch);
  if (!body.ok) return body.response;
  const policy = await loadFieldPolicy(auth.role);
  const blocked = blockedWrites(policy, "deals", body.keys);
  if (blocked.length) return apiError(`Not permitted to set field(s): ${blocked.join(", ")}`, 403);
  const { custom, stageId, pipelineId: _ignored, ...fields } = body.data;
  void _ignored; // deals cannot move between pipelines via PATCH

  const now = Date.now();
  const stageChanged = stageId !== undefined && stageId !== existing.stageId;
  let newStage = null;
  if (stageChanged) {
    newStage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId!)).limit(1))[0];
    if (!newStage || newStage.pipelineId !== existing.pipelineId) {
      return apiError("Invalid stage");
    }
  }

  await db.update(tables.deals)
    .set({
      ...fields,
      ...(stageChanged
        ? {
            stageId: stageId!,
            stageEnteredAt: now,
            closedAt: newStage!.type === "open" ? null : now,
          }
        : {}),
      ...(custom !== undefined
        ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
        : {}),
      updatedAt: now,
    })
    .where(eq(tables.deals.id, id));

  const row = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
  const snapshot = { ...row, custom: undefined, stageName: newStage?.name };

  if (stageChanged) {
    const oldStage = (await db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.id, existing.stageId))
      .limit(1))[0];
    await logActivity({
      type: "stage_changed",
      entityType: "deal",
      entityId: id,
      actorId: auth.user?.id,
      meta: { from: oldStage?.name, to: newStage!.name },
    });
    await dispatchEvent({ event: "deal.stage_changed", entityType: "deal", entityId: id, snapshot });
    if (newStage!.type === "won") {
      await dispatchEvent({ event: "deal.won", entityType: "deal", entityId: id, snapshot });
    } else if (newStage!.type === "lost") {
      await dispatchEvent({ event: "deal.lost", entityType: "deal", entityId: id, snapshot });
    }
  } else if (Object.keys(fields).length > 0 || custom !== undefined) {
    await logActivity({
      type: "updated",
      entityType: "deal",
      entityId: id,
      actorId: auth.user?.id,
      meta: { fields: Object.keys(fields) },
    });
  }
  await audit(auth.user?.id, "deal.updated", { objectType: "deal", objectId: id });
  await recomputeDealScore(id);
  const scored = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
  return json({ deal: redact(policy, "deals", { ...scored, custom: JSON.parse(scored.custom) }) });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "deals", "delete");
  if (denied) return denied;
  const { id } = await params;
  const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
  if (!existing) return apiError("Deal not found", 404);
  await db.delete(tables.deals).where(eq(tables.deals.id, id));
  await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
  await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
  await audit(auth.user?.id, "deal.deleted", { objectType: "deal", objectId: id });
  return json({ ok: true });
  });
}
