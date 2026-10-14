import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { deleteInput } from "../schemas";
import { ActionError, type PayloadEnvelope } from "../types";
import type { EventContext } from "@/lib/workflows/types";
import { auditMeta } from "./shared";
import { trashRecord } from "@/lib/trash";

/**
 * Either the dry run or the deletion. The MCP tool returns this as-is — the
 * dry run is how an agent shows a human what it is about to remove — while the
 * REST and GraphQL handlers, which have always deleted outright, reduce it to
 * their own answer.
 */
type DeleteResult =
  | { dryRun: true; wouldDelete: { type: "company"; id: string; name: string }; hint: string }
  | { deleted: true; type: "company"; id: string };

export const companiesDelete = defineAction({
  name: "companies.delete",
  object: "companies",
  verb: "delete",
  description: "Delete a company by id. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }, ctx): Promise<PayloadEnvelope<DeleteResult> & { snapshot: Record<string, unknown> | null }> => {
    const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Company not found");

    if (confirm !== true) {
      return {
        snapshot: null,
        payload: {
        dryRun: true,
        wouldDelete: { type: "company", id, name: existing.name },
        hint: "Re-call with confirm=true to delete. It moves to the Trash for 30 days with its notes and timeline; its contacts and deals are detached, not deleted, and re-attached on restore.",
        },
      };
    }
    await trashRecord("company", id, ctx.userId);
    // What the record was, for the workflows and webhooks that start on its deletion.
    return { payload: { deleted: true, type: "company", id }, snapshot: { ...existing, custom: undefined } };
  },
  effects: {
    audit: (_i, out, ctx) =>
      "dryRun" in out.payload
        ? null
        : { key: "company.deleted", objectType: "company", objectId: out.payload.id, meta: auditMeta(ctx) },
    events: (_i, out): EventContext[] =>
      out.snapshot ? [{ event: "company.deleted", entityType: "company", entityId: String(out.snapshot.id), snapshot: out.snapshot }] : [],
  },
});
