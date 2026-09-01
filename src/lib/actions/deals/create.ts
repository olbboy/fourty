import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { dealInput } from "@/lib/validators";
import { ensureDefaultPipeline } from "@/db/seed";
import { recomputeDealScore } from "@/lib/services/deal-score";
import { encodeCustom } from "@/lib/custom-fields";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { auditMeta, toDeal, type Deal } from "./shared";

export const dealsCreate = defineAction({
  name: "deals.create",
  object: "deals",
  verb: "create",
  description:
    "Create a deal. Requires name. Uses the default pipeline's first stage unless stageId is given. Returns the deal with its computed health score.",
  input: dealInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Deal> => {
    const pipelineId = data.pipelineId ?? (await ensureDefaultPipeline());
    let stageId = data.stageId;
    if (!stageId) {
      const first = (
        await db
          .select()
          .from(tables.stages)
          .where(eq(tables.stages.pipelineId, pipelineId))
          .orderBy(tables.stages.order)
          .limit(1)
      )[0];
      if (!first) throw new ActionError("invalid", "Pipeline has no stages");
      stageId = first.id;
    } else {
      const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId)).limit(1))[0];
      if (!stage || stage.pipelineId !== pipelineId) {
        throw new ActionError("invalid", "Invalid stage for pipeline");
      }
    }

    const now = Date.now();
    const id = newId();
    const { custom, ...fields } = data;
    const blob = await encodeCustom("deal", custom ?? {});
    if (!blob.ok) throw new ActionError("invalid", blob.error);
    await db.insert(tables.deals).values({
      id,
      ...fields,
      pipelineId,
      stageId,
      ownerId: ctx.userId,
      stageEnteredAt: now,
      custom: blob.json,
      createdAt: now,
      updatedAt: now,
    });
    // Score first, so the row the workflow snapshot carries is the scored one.
    await recomputeDealScore(id);
    return toDeal((await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!);
  },
  effects: {
    activity: (_i, row, ctx) => ({ type: "created", entityType: "deal", entityId: row.id, actorId: ctx.userId }),
    audit: (_i, row, ctx) => ({
      key: "deal.created",
      objectType: "deal",
      objectId: row.id,
      meta: auditMeta(ctx),
    }),
    events: (_i, row) => [
      { event: "deal.created", entityType: "deal", entityId: row.id, snapshot: { ...row, custom: undefined } },
    ],
  },
});
