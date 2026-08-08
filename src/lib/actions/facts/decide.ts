import { z } from "zod";
import { blockedWrites, loadFieldPolicy } from "@/lib/field-permissions";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { permissionField, permissionObject, resolveField, type FactEntity } from "@/lib/facts/fields";
import { decideFact, factById, type DecideOutcome } from "@/lib/facts/record-fact";

/**
 * A human's decision on a suggestion: accept it, dismiss it forever, or revert
 * one the pass applied. Reverting is a new decision, not an erased one.
 */
export const factsDecide = defineAction({
  name: "facts.decide",
  object: "facts",
  verb: "update",
  description:
    "Decide a suggestion: accept writes it to the record, dismiss retires that exact value permanently, revert undoes a fact the background pass applied and restores what was there before.",
  input: z.object({
    id: z.string().min(1),
    decision: z.enum(["accept", "dismiss", "revert"]),
  }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input, ctx): Promise<DecideOutcome> => {
    // Writing the record's field is the point of accepting, so the caller needs
    // permission on *that* field — not merely on suggestions.
    if (input.decision !== "dismiss") {
      const fact = await factById(input.id);
      if (!fact) throw new ActionError("not_found", "No such fact.");
      const entity = fact.entityType as FactEntity;
      const resolved = await resolveField(entity, fact.field);
      if (resolved) {
        const policy = await loadFieldPolicy(ctx.role);
        const blocked = blockedWrites(policy, permissionObject(entity), [permissionField(resolved)]);
        if (blocked.length) {
          throw new ActionError(
            "forbidden",
            `Forbidden: cannot write ${permissionObject(entity)} field(s): ${blocked.join(", ")}`,
          );
        }
      }
    }

    const outcome = await decideFact(input.id, input.decision, { userId: ctx.userId, via: ctx.via });
    if (!outcome.ok) {
      throw new ActionError(outcome.code === "wrong_status" ? "invalid" : "not_found", outcome.reason);
    }
    return outcome;
  },
});
