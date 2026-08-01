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
  | { dryRun: true; wouldDelete: { type: "contact"; id: string; name: string }; hint: string }
  | { deleted: true; type: "contact"; id: string };

export const contactsDelete = defineAction({
  name: "contacts.delete",
  object: "contacts",
  verb: "delete",
  description: "Delete a contact by id. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }): Promise<DeleteResult> => {
    const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Contact not found");

    if (confirm !== true) {
      return {
        dryRun: true,
        wouldDelete: { type: "contact", id, name: `${existing.firstName} ${existing.lastName}`.trim() },
        hint: "Re-call with confirm=true to actually delete (also removes its notes + activities).",
      };
    }
    // notes and activities point at the contact through a polymorphic key, so
    // the database cannot cascade this for us.
    await db.delete(tables.contacts).where(eq(tables.contacts.id, id));
    await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
    await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
    return { deleted: true, type: "contact", id };
  },
  effects: {
    // Nothing was removed on a dry run, so there is nothing to record.
    audit: (_i, out, ctx) =>
      "dryRun" in out
        ? null
        : { key: "contact.deleted", objectType: "contact", objectId: out.id, meta: auditMeta(ctx) },
  },
});
