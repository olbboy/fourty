import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { displayName } from "@/lib/format";
import { loadFieldPolicy } from "@/lib/field-permissions";
import { mergeCompanies, mergeContacts } from "@/lib/merge";
import { can } from "@/lib/permissions";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "./define";
import { register } from "./registry";
import { ActionError } from "./types";

const mergeInput = z.object({ id: z.string().min(1), duplicateId: z.string().min(1) });
type Merged = { id: string; from: string; duplicateId: string; filled: string[] };

/**
 * Merge a duplicate into the record at `id` (D13). Both must exist and differ,
 * and the caller must be allowed to delete, since the duplicate goes to the
 * Trash. Checked before anything is written.
 */
function mergeAction(kind: "contact" | "company") {
  const object = kind === "contact" ? "contacts" : "companies";
  const table = kind === "contact" ? tables.contacts : tables.companies;
  return defineAction({
    name: `${object}.merge`,
    object,
    verb: "update",
    description: `Merge a duplicate ${kind} (duplicateId) into this one (id): its links, tasks, notes and timeline move over, empty fields here take its values, and the duplicate goes to the Trash.`,
    input: mergeInput,
    expose: { rest: true },
    run: async ({ id, duplicateId }, ctx): Promise<Merged> => {
      if (!can(ctx.role, object, "delete")) throw new ActionError("forbidden", `Forbidden: ${ctx.role} cannot delete ${object}`);
      if (id === duplicateId) throw new ActionError("invalid", "duplicateId: a record cannot be merged into itself");
      const t = table as typeof tables.companies;
      // Both rows locked, in id order, so two merges over the same records take turns.
      const [first, second] = [id, duplicateId].sort();
      const lockedFirst = (await db.select().from(t).where(eq(t.id, first!)).limit(1).for("update"))[0] as Record<string, unknown> | undefined;
      const lockedSecond = (await db.select().from(t).where(eq(t.id, second!)).limit(1).for("update"))[0] as Record<string, unknown> | undefined;
      const keep = first === id ? lockedFirst : lockedSecond;
      const dupe = first === id ? lockedSecond : lockedFirst;
      if (!keep || !dupe) throw new ActionError("not_found", `${kind === "contact" ? "Contact" : "Company"} not found`);
      const from = kind === "contact" ? displayName(dupe.firstName as string, dupe.lastName as string) : String(dupe.name);
      const policy = await loadFieldPolicy(ctx.role);
      const filled = kind === "contact" ? await mergeContacts(keep, dupe, policy, ctx.userId) : await mergeCompanies(keep, dupe, policy, ctx.userId);
      return { id, from, duplicateId, filled };
    },
    effects: {
      activity: (_i, out, ctx) => ({ type: "merged", entityType: kind, entityId: out.id, actorId: ctx.userId, meta: { from: out.from, filled: out.filled } }),
      audit: (_i, out) => ({ key: `${kind}.merged`, objectType: kind, objectId: out.id, meta: { duplicateId: out.duplicateId } }),
      rescore: async (_i, out) => {
        if (kind === "contact") await recomputeContactScore(out.id);
      },
    },
  });
}

export const contactsMerge = mergeAction("contact");
export const companiesMerge = mergeAction("company");

register(contactsMerge);
register(companiesMerge);
