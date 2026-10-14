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
  | { dryRun: true; wouldDelete: { type: "contact"; id: string; name: string }; hint: string }
  | { deleted: true; type: "contact"; id: string };

export const contactsDelete = defineAction({
  name: "contacts.delete",
  object: "contacts",
  verb: "delete",
  description: "Delete a contact by id. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }, ctx): Promise<PayloadEnvelope<DeleteResult> & { snapshot: Record<string, unknown> | null }> => {
    const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Contact not found");

    if (confirm !== true) {
      return {
        snapshot: null,
        payload: {
        dryRun: true,
        wouldDelete: { type: "contact", id, name: `${existing.firstName} ${existing.lastName}`.trim() },
        hint: "Re-call with confirm=true to delete. It moves to the Trash with its notes and timeline for 30 days, where it can be restored.",
        },
      };
    }
    await trashRecord("contact", id, ctx.userId);
    // What the record was, for the workflows and webhooks that start on its deletion.
    return { payload: { deleted: true, type: "contact", id }, snapshot: { ...existing, custom: undefined } };
  },
  effects: {
    // Nothing was removed on a dry run, so there is nothing to record.
    audit: (_i, out, ctx) =>
      "dryRun" in out.payload
        ? null
        : { key: "contact.deleted", objectType: "contact", objectId: out.payload.id, meta: auditMeta(ctx) },
    events: (_i, out): EventContext[] =>
      out.snapshot ? [{ event: "contact.deleted", entityType: "contact", entityId: String(out.snapshot.id), snapshot: out.snapshot }] : [],
  },
});
