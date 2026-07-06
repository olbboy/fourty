import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { dealPatch } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = db.select().from(tables.deals).where(eq(tables.deals.id, id)).get();
  if (!row) return apiError("Deal not found", 404);
  return json({ deal: { ...row, custom: JSON.parse(row.custom) } });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = db.select().from(tables.deals).where(eq(tables.deals.id, id)).get();
  if (!existing) return apiError("Deal not found", 404);

  const body = await parseBody(req, dealPatch);
  if (!body.ok) return body.response;
  const { custom, stageId, pipelineId: _ignored, ...fields } = body.data;
  void _ignored; // deals cannot move between pipelines via PATCH

  const now = Date.now();
  const stageChanged = stageId !== undefined && stageId !== existing.stageId;
  let newStage = null;
  if (stageChanged) {
    newStage = db.select().from(tables.stages).where(eq(tables.stages.id, stageId!)).get();
    if (!newStage || newStage.pipelineId !== existing.pipelineId) {
      return apiError("Invalid stage");
    }
  }

  db.update(tables.deals)
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
    .where(eq(tables.deals.id, id))
    .run();

  const row = db.select().from(tables.deals).where(eq(tables.deals.id, id)).get()!;
  const snapshot = { ...row, custom: undefined, stageName: newStage?.name };

  if (stageChanged) {
    const oldStage = db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.id, existing.stageId))
      .get();
    logActivity({
      type: "stage_changed",
      entityType: "deal",
      entityId: id,
      actorId: auth.user?.id,
      meta: { from: oldStage?.name, to: newStage!.name },
    });
    dispatchEvent({ event: "deal.stage_changed", entityType: "deal", entityId: id, snapshot });
    if (newStage!.type === "won") {
      dispatchEvent({ event: "deal.won", entityType: "deal", entityId: id, snapshot });
    } else if (newStage!.type === "lost") {
      dispatchEvent({ event: "deal.lost", entityType: "deal", entityId: id, snapshot });
    }
  } else if (Object.keys(fields).length > 0 || custom !== undefined) {
    logActivity({
      type: "updated",
      entityType: "deal",
      entityId: id,
      actorId: auth.user?.id,
      meta: { fields: Object.keys(fields) },
    });
  }
  return json({ deal: { ...row, custom: JSON.parse(row.custom) } });
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = db.select().from(tables.deals).where(eq(tables.deals.id, id)).get();
  if (!existing) return apiError("Deal not found", 404);
  db.delete(tables.deals).where(eq(tables.deals.id, id)).run();
  db.delete(tables.notes).where(eq(tables.notes.entityId, id)).run();
  db.delete(tables.activities).where(eq(tables.activities.entityId, id)).run();
  return json({ ok: true });
}
