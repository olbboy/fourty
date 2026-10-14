import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { loadReportingSettings } from "@/lib/reporting";
import { bulkDeleteAction, bulkIdsInput, existingOrThrow } from "../bulk";
import { defineAction } from "../define";
import { execute } from "../execute";
import { ActionError } from "../types";
import { dealsDelete } from "./delete";
import { dealsUpdate } from "./update";

/**
 * Move many deals into one stage. Every deal is checked before any moves: all
 * must be in the stage's pipeline, and closing as lost needs each one's lost
 * reason when the workspace asks for it. Then each moves through deals.update,
 * with its own timeline line, won/lost workflows and score.
 */
export const dealsBulkMove = defineAction({
  name: "deals.bulkMove",
  object: "deals",
  verb: "update",
  description: "Move many deals into one stage. If any of them cannot go there, none moves.",
  input: bulkIdsInput.extend({ stageId: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ ids, stageId }, ctx): Promise<{ updated: number }> => {
    const unique = await existingOrThrow("deals", ids, "deals");
    const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId)).limit(1))[0];
    if (!stage) throw new ActionError("invalid", "stageId: no such stage");
    const deals = await db.select().from(tables.deals).where(inArray(tables.deals.id, unique));
    const elsewhere = deals.filter((d) => d.pipelineId !== stage.pipelineId);
    if (elsewhere.length) {
      throw new ActionError("invalid", `stageId: not in the pipeline of ${elsewhere.map((d) => d.name).join(", ")}`);
    }
    const { lostReasonField } = await loadReportingSettings();
    if (stage.type === "lost" && lostReasonField) {
      const missing = deals.filter((d) => {
        const reason = (JSON.parse(d.custom) as Record<string, unknown>)[lostReasonField];
        return reason === undefined || reason === null || reason === "";
      });
      if (missing.length) {
        throw new ActionError("invalid", `${lostReasonField}: choose a lost reason first for ${missing.map((d) => d.name).join(", ")}`);
      }
    }
    for (const id of unique) await execute(dealsUpdate, { id, stageId }, ctx);
    return { updated: unique.length };
  },
});

export const dealsBulkDelete = bulkDeleteAction({ name: "deals.bulkDelete", object: "deals", noun: "deals", remove: dealsDelete });
