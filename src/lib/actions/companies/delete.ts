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
  | { dryRun: true; wouldDelete: { type: "company"; id: string; name: string }; hint: string }
  | { deleted: true; type: "company"; id: string };

export const companiesDelete = defineAction({
  name: "companies.delete",
  object: "companies",
  verb: "delete",
  description: "Delete a company by id. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }): Promise<DeleteResult> => {
    const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Company not found");

    if (confirm !== true) {
      return {
        dryRun: true,
        wouldDelete: { type: "company", id, name: existing.name },
        hint: "Re-call with confirm=true to delete (contacts/deals are detached, not deleted).",
      };
    }
    await db.delete(tables.companies).where(eq(tables.companies.id, id));
    // Detach children rather than cascade-delete.
    await db.update(tables.contacts).set({ companyId: null }).where(eq(tables.contacts.companyId, id));
    await db.update(tables.deals).set({ companyId: null }).where(eq(tables.deals.companyId, id));
    await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
    await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
    return { deleted: true, type: "company", id };
  },
  effects: {
    audit: (_i, out, ctx) =>
      "dryRun" in out
        ? null
        : { key: "company.deleted", objectType: "company", objectId: out.id, meta: auditMeta(ctx) },
  },
});
