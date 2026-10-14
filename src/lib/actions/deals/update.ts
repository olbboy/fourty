import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { dealPatch } from "@/lib/validators";
import { recomputeDealScore } from "@/lib/services/deal-score";
import { lockPipelineWorkspace } from "@/lib/services/pipelines";
import { customFieldDefsOf, encodeCustom } from "@/lib/custom-fields";
import { loadReportingSettings } from "@/lib/reporting";
import { linesTotal } from "@/lib/deal-lines";
import { ownerChange as changeOfOwner, resolveOwner, type OwnerChange } from "../assignees";
import type { EventContext } from "@/lib/workflows/types";
import { defineAction } from "../define";
import { ActionError, type PayloadEnvelope } from "../types";
import { auditMeta, toDeal, type Deal } from "./shared";

type StageInfo = { name: string; type: string };
/**
 * What a value was and what it became, for the values a forecast reads: the
 * Amount (with both currencies), the Expected close date and the Delivery date
 * (by the label its field had at the time).
 */
export type ValueChange =
  | { field: "amount"; from: number | null; to: number | null; fromCurrency: string; toCurrency: string }
  | { field: "expectedCloseDate"; from: number | null; to: number | null }
  | { field: "delivery"; label: string; from: number | null; to: number | null };

type UpdateResult = PayloadEnvelope<Deal> & {
  fieldKeys: string[];
  touchedCustom: boolean;
  stageChanged: boolean;
  oldStage: StageInfo | null;
  newStage: StageInfo | null;
  ownerChange: OwnerChange | null;
  valueChanges: ValueChange[];
  /** Pre-rescore row, matching the REST snapshot the workflows already see. */
  snapshot: Record<string, unknown>;
};

export const dealsUpdate = defineAction({
  name: "deals.update",
  object: "deals",
  verb: "update",
  description:
    "Update a deal by id. Pass stageId to move it along the pipeline (fires won/lost workflows). If the workspace names a lost-reason field, moving into a lost stage needs that field filled (pass it in custom). Recomputes the health score.",
  input: dealPatch.extend({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, ...patch }, ctx): Promise<UpdateResult> => {
    // A stage move races with stage type/probability changes and stage
    // deletion. Metadata-only updates do not depend on pipeline membership and
    // deliberately keep the shorter transaction path.
    if (patch.stageId !== undefined) await lockPipelineWorkspace(ctx.workspaceId);
    const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Deal not found");

    // pipelineId is accepted by the patch schema but deals cannot move pipelines.
    const { custom, stageId, pipelineId: _ignored, ownerId: requestedOwner, ...fields } = patch;
    void _ignored;
    // A deal with Line items has their sum as its Amount, in its own currency:
    // both are changed through the lines, never typed over them.
    const currencyChanged = fields.currency !== undefined && fields.currency !== existing.currency;
    if (fields.amount !== undefined || currencyChanged) {
      const total = await linesTotal(id);
      if (total !== null && (currencyChanged || fields.amount !== total)) {
        throw new ActionError("invalid", "amount: this deal's line items set its amount and currency; change the line items instead");
      }
    }
    const ownerPatch = requestedOwner !== undefined ? { ownerId: await resolveOwner(requestedOwner, ctx) } : {};
    const ownerChange: OwnerChange | null =
      ownerPatch.ownerId !== undefined ? await changeOfOwner(existing.ownerId, ownerPatch.ownerId) : null;

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

    const settings = await loadReportingSettings();
    const before = JSON.parse(existing.custom) as Record<string, unknown>;
    // A deal closes as lost only with the reason the workspace asks for.
    if (stageChanged && newStage!.type === "lost" && settings.lostReasonField) {
      const reason = { ...before, ...(custom ?? {}) }[settings.lostReasonField];
      if (reason === undefined || reason === null || reason === "") {
        throw new ActionError("invalid", `${settings.lostReasonField}: choose a lost reason to close this deal as lost`);
      }
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
        ...ownerPatch,
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
    const valueChanges = await changedValues(existing, mid, settings.deliveryField);
    const snapshot = { ...mid, custom: undefined, stageName: newStage?.name };
    await recomputeDealScore(id);
    return {
      payload: toDeal((await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!),
      fieldKeys: Object.keys(fields),
      touchedCustom: custom !== undefined,
      stageChanged,
      oldStage: oldStage ? { name: oldStage.name, type: oldStage.type } : null,
      newStage: newStage ? { name: newStage.name, type: newStage.type } : null,
      ownerChange,
      valueChanges,
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
          meta: { from: out.oldStage?.name, to: out.newStage.name, ...withChanges(out.valueChanges) },
        };
      }
      // One timeline entry per write: a stage move outranks an owner change.
      if (out.ownerChange) {
        return {
          type: "owner_changed",
          entityType: "deal",
          entityId: out.payload.id,
          actorId: ctx.userId,
          meta: { ...out.ownerChange, ...withChanges(out.valueChanges) },
        };
      }
      if (out.fieldKeys.length === 0 && !out.touchedCustom) return null;
      return {
        type: "updated",
        entityType: "deal",
        entityId: out.payload.id,
        actorId: ctx.userId,
        meta: { fields: out.fieldKeys, ...withChanges(out.valueChanges) },
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

const withChanges = (changes: ValueChange[]) => (changes.length ? { changes } : {});

type DealRow = typeof tables.deals.$inferSelect;
const asTime = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** The forecast-relevant values that differ between two versions of a deal. */
async function changedValues(before: DealRow, after: DealRow, deliveryField: string | null): Promise<ValueChange[]> {
  const changes: ValueChange[] = [];
  if (before.amount !== after.amount || before.currency !== after.currency) {
    changes.push({
      field: "amount",
      from: before.amount,
      to: after.amount,
      fromCurrency: before.currency,
      toCurrency: after.currency,
    });
  }
  if (before.expectedCloseDate !== after.expectedCloseDate) {
    changes.push({ field: "expectedCloseDate", from: before.expectedCloseDate, to: after.expectedCloseDate });
  }
  if (deliveryField) {
    const from = asTime(JSON.parse(before.custom)[deliveryField]);
    const to = asTime(JSON.parse(after.custom)[deliveryField]);
    if (from !== to) {
      const def = (await customFieldDefsOf("deal")).find((d) => d.key === deliveryField);
      changes.push({ field: "delivery", label: def?.label ?? deliveryField, from, to });
    }
  }
  return changes;
}

