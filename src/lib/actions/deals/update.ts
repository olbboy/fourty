import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { dealPatch } from "@/lib/validators";
import { recomputeDealScore } from "@/lib/services/deal-score";
import { encodeCustom } from "@/lib/custom-fields";
import type { EventContext } from "@/lib/workflows/types";
import { defineAction } from "../define";
import { ActionError, type PayloadEnvelope } from "../types";
import { auditMeta, toDeal, type Deal } from "./shared";

type StageInfo = { name: string; type: string };

type UpdateResult = PayloadEnvelope<Deal> & {
  fieldKeys: string[];
  touchedCustom: boolean;
  stageChanged: boolean;
  oldStage: StageInfo | null;
  newStage: StageInfo | null;
  /** Pre-rescore row, matching the REST snapshot the workflows already see. */
  snapshot: Record<string, unknown>;
};

export const dealsUpdate = defineAction({
  name: "deals.update",
  object: "deals",
  verb: "update",
  description:
    "Update a deal by id. Pass stageId to move it along the pipeline (fires won/lost workflows). Recomputes the health score.",
  input: dealPatch.extend({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, ...patch }): Promise<UpdateResult> => {
    const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Deal not found");

    // pipelineId is accepted by the patch schema but deals cannot move pipelines.
    const { custom, stageId, pipelineId: _ignored, ...fields } = patch;
    void _ignored;

    const now = Date.now();
    const stageChanged = stageId !== undefined && stageId !== existing.stageId;
    let newStage: (typeof tables.stages.$inferSelect) | null = null;
    let oldStage: (typeof tables.stages.$inferSelect) | null = null;
    if (stageChanged) {
      newStage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId!)).limit(1))[0] ?? null;
      if (!newStage || newStage.pipelineId !== existing.pipelineId) {
        throw new ActionError("invalid", "Invalid stage");
      }
      oldStage = (await db.select().from(tables.stages).where(eq(tables.stages.id, existing.stageId)).limit(1))[0] ?? null;
    }

    let customJson: string | undefined;
    if (custom !== undefined) {
      const blob = await encodeCustom("deal", { ...JSON.parse(existing.custom), ...custom });
      if (!blob.ok) throw new ActionError("invalid", blob.error);
      customJson = blob.json;
    }
    await db
      .update(tables.deals)
      .set({
        ...fields,
        ...(stageChanged
          ? {
              stageId: stageId!,
              stageEnteredAt: now,
              closedAt: newStage!.type === "open" ? null : now,
            }
          : {}),
        ...(customJson !== undefined ? { custom: customJson } : {}),
        updatedAt: now,
      })
      .where(eq(tables.deals.id, id));

    const mid = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
    const snapshot = { ...mid, custom: undefined, stageName: newStage?.name };
    await recomputeDealScore(id);
    return {
      payload: toDeal((await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!),
      fieldKeys: Object.keys(fields),
      touchedCustom: custom !== undefined,
      stageChanged,
      oldStage: oldStage ? { name: oldStage.name, type: oldStage.type } : null,
      newStage: newStage ? { name: newStage.name, type: newStage.type } : null,
      snapshot,
    };
  },
  effects: {
    activity: (_i, out, ctx) => {
      if (out.stageChanged && out.newStage) {
        return {
          type: "stage_changed",
          entityType: "deal",
          entityId: out.payload.id,
          actorId: ctx.userId,
          meta: { from: out.oldStage?.name, to: out.newStage.name },
        };
      }
      if (out.fieldKeys.length === 0 && !out.touchedCustom) return null;
      return {
        type: "updated",
        entityType: "deal",
        entityId: out.payload.id,
        actorId: ctx.userId,
        meta: { fields: out.fieldKeys },
      };
    },
    audit: (_i, out, ctx) => ({
      key: "deal.updated",
      objectType: "deal",
      objectId: out.payload.id,
      meta: auditMeta(ctx),
    }),
    events: (_i, out): EventContext[] => {
      if (!out.stageChanged || !out.newStage) return [];
      const base = { entityType: "deal" as const, entityId: out.payload.id, snapshot: out.snapshot };
      const events: EventContext[] = [{ event: "deal.stage_changed", ...base }];
      if (out.newStage.type === "won") events.push({ event: "deal.won", ...base });
      else if (out.newStage.type === "lost") events.push({ event: "deal.lost", ...base });
      return events;
    },
  },
});
