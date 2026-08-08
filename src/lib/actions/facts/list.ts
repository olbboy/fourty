import { z } from "zod";
import { loadFieldPolicy } from "@/lib/field-permissions";
import { defineAction } from "../define";
import { FACT_ENTITIES, permissionField, permissionObject, resolveField, type FactEntity } from "@/lib/facts/fields";
import { listFacts, type FactRow } from "@/lib/facts/record-fact";

/**
 * The suggestion inbox. PROBABLE and VERIFIED only — POSSIBLE rows are stored
 * and never surfaced, because a rep who is shown weak guesses stops reading
 * suggestions altogether.
 */
export const factsList = defineAction({
  name: "facts.list",
  object: "facts",
  verb: "read",
  description:
    "List suggestions waiting on a human — what a background pass believes about a record's fields, with the evidence behind each. Pass entityId to scope it to one record.",
  input: z.object({
    entityType: z.enum(FACT_ENTITIES).optional(),
    entityId: z.string().optional(),
    status: z.enum(["PROPOSED", "APPLIED", "DISMISSED", "SUPERSEDED"]).optional(),
    limit: z.coerce.number().optional(),
  }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input, ctx): Promise<FactRow[]> => {
    const rows = await listFacts(input);
    // A suggestion about a field the caller cannot read must not be listed —
    // otherwise the inbox becomes the way around field permissions (ADR-011).
    const policy = await loadFieldPolicy(ctx.role);
    if (!policy) return rows;
    const visible: FactRow[] = [];
    for (const row of rows) {
      const entity = row.entityType as FactEntity;
      const resolved = await resolveField(entity, row.field);
      if (!resolved) continue;
      const rule = policy.rules.get(`${permissionObject(entity)}.${permissionField(resolved)}`);
      if (!rule || rule.read) visible.push(row);
    }
    return visible;
  },
});
