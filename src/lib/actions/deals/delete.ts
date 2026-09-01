import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { deleteInput } from "../schemas";
import { ActionError } from "../types";
import { auditMeta } from "./shared";

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
  run: async ({ id, confirm }): Promise<DeleteResult> => {
    const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Deal not found");

    if (confirm !== true) {
      return {
        dryRun: true,
        wouldDelete: { type: "deal", id, name: existing.name, amount: existing.amount },
        hint: "Re-call with confirm=true to actually delete (also removes its notes + activities).",
      };
    }
    await db.delete(tables.deals).where(eq(tables.deals.id, id));
    await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
    await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
    return { deleted: true, type: "deal", id };
  },
  effects: {
    audit: (_i, out, ctx) =>
      "dryRun" in out
        ? null
        : { key: "deal.deleted", objectType: "deal", objectId: out.id, meta: auditMeta(ctx) },
  },
});
