import { z } from "zod";
import { defineAction } from "./define";
import { execute } from "./execute";
import { resolveOwner } from "./assignees";
import { ActionError, type ActionDef } from "./types";

export const reassignInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  ownerId: z.string().min(1).max(64).nullable(),
});

/**
 * Give many records one owner, e.g. a departing member's deals. Each record
 * goes through its own update action, so a bulk move is exactly a run of single
 * edits: the same checks, timeline entry, audit line and score. All or nothing:
 * an unknown id or an owner who is not an active member changes nothing.
 */
export function reassignAction(opts: {
  name: string;
  object: "deals" | "tasks" | "contacts" | "companies";
  noun: string;
  update: ActionDef<any, any>;
  /** How many of these ids exist in the current workspace. */
  countExisting: (ids: string[]) => Promise<number>;
}) {
  return defineAction({
    name: opts.name,
    object: opts.object,
    verb: "update",
    description: `Give many ${opts.noun} one owner at once (ownerId null leaves them unassigned). Each change is recorded like a single edit. If any id is unknown or the owner is not an active member, nothing changes.`,
    input: reassignInput,
    expose: { rest: true, graphql: true, mcp: true, ai: true },
    run: async ({ ids, ownerId }, ctx): Promise<{ updated: number }> => {
      const unique = [...new Set(ids)];
      if ((await opts.countExisting(unique)) !== unique.length) {
        throw new ActionError("not_found", `Some ${opts.noun} were not found`);
      }
      await resolveOwner(ownerId, ctx);
      for (const id of unique) await execute(opts.update, { id, ownerId }, ctx);
      return { updated: unique.length };
    },
  });
}
