import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "./define";
import { execute } from "./execute";
import { ActionError, type ActionDef } from "./types";

/** The objects a list can act on in bulk, and their tables. */
const TABLES = { deals: tables.deals, contacts: tables.contacts, companies: tables.companies, tasks: tables.tasks };
export type BulkObject = keyof typeof TABLES;

export const bulkIdsInput = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

/**
 * The distinct ids, after checking every one exists in this workspace: a bulk
 * change touches all of them or none, so an unknown id stops it before any write.
 */
export async function existingOrThrow(object: BulkObject, ids: string[], noun: string): Promise<string[]> {
  const unique = [...new Set(ids)];
  const table = TABLES[object] as typeof tables.deals;
  const found = await db.select({ id: table.id }).from(table).where(inArray(table.id, unique));
  if (found.length !== unique.length) throw new ActionError("not_found", `Some ${noun} were not found`);
  return unique;
}

/**
 * Delete many records into the Trash. Each goes through its own delete action,
 * so the Trash, audit and timeline are exactly those of one-by-one deletes.
 * REST only: the agent surfaces keep their dry-run-first delete tools.
 */
export function bulkDeleteAction(opts: { name: string; object: BulkObject; noun: string; remove: ActionDef<any, any> }) {
  return defineAction({
    name: opts.name,
    object: opts.object,
    verb: "delete",
    description: `Delete many ${opts.noun} at once; they go to the Trash for 30 days. If any id is unknown, nothing is deleted.`,
    input: bulkIdsInput,
    expose: { rest: true },
    run: async ({ ids }, ctx): Promise<{ deleted: number }> => {
      const unique = await existingOrThrow(opts.object, ids, opts.noun);
      for (const id of unique) await execute(opts.remove, { id, confirm: true }, ctx);
      return { deleted: unique.length };
    },
  });
}
