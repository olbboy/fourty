import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { deleteInput } from "../schemas";
import { ActionError } from "../types";
import { deleted, deletedEvents, nothingDeleted, type Deletion } from "../deletion";
import { auditMeta } from "./shared";
import { trashRecord } from "@/lib/trash";

/**
 * Either the dry run or the deletion. The MCP tool returns this as-is — the
 * dry run is how an agent shows a human what it is about to remove — while the
 * REST and GraphQL handlers, which have always deleted outright, reduce it to
 * their own answer.
 */
type DeleteResult =
  | { dryRun: true; wouldDelete: { type: "deal"; id: string; name: string; amount: number }; hint: string }
  | { deleted: true; type: "deal"; id: string };

export const dealsDelete = defineAction({
  name: "deals.delete",
  object: "deals",
  verb: "delete",
  description: "Delete a deal by id. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }, ctx): Promise<Deletion<DeleteResult>> => {
    const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Deal not found");

    if (confirm !== true) {
      return nothingDeleted<DeleteResult>({
        dryRun: true,
        wouldDelete: { type: "deal", id, name: existing.name, amount: existing.amount },
        hint: "Re-call with confirm=true to delete. It moves to the Trash with its notes and timeline for 30 days, where it can be restored.",
      });
    }
    await trashRecord("deal", id, ctx.userId);
    return deleted<DeleteResult>({ deleted: true, type: "deal", id }, existing);
  },
  effects: {
    audit: (_i, out, ctx) =>
      "dryRun" in out.payload
        ? null
        : { key: "deal.deleted", objectType: "deal", objectId: out.payload.id, meta: auditMeta(ctx) },
    events: (_i, out) => deletedEvents("deal", out),
  },
});
