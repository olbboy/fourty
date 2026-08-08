import { z } from "zod";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { EVIDENCE_KIND_NAMES } from "@/lib/facts/evidence";
import { FACT_ENTITIES } from "@/lib/facts/fields";
import { recordFact, type RecordFactOutcome } from "@/lib/facts/record-fact";

/**
 * Record an observation about a field (ADR-018).
 *
 * Note what the input does **not** accept: no `score`, no `confidence`, and no
 * bare `sourceUrl` offered as proof. A caller reports what it saw, as a closed
 * enum, and a pure function prices it. That is the whole design — a parameter
 * for certainty here would be the vulnerability, not a convenience.
 */
export const factsRecord = defineAction({
  name: "facts.record",
  object: "facts",
  verb: "create",
  description:
    "Record an observation about a field of a contact or company. You report WHAT YOU OBSERVED (a closed set of evidence kinds), never how confident you are — the score is computed. Most observations become a suggestion for a human, which is a correct outcome.",
  input: z.object({
    entityType: z.enum(FACT_ENTITIES),
    entityId: z.string().min(1),
    field: z.string().min(1),
    value: z.string().min(1),
    evidence: z
      .array(
        z.object({
          kind: z.enum(EVIDENCE_KIND_NAMES as [string, ...string[]]),
          detail: z.string().min(1).max(500),
          sourceUrl: z.string().url().optional(),
        }),
      )
      .min(1),
    sourceUrl: z.string().url().optional(),
  }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input, ctx): Promise<RecordFactOutcome> => {
    const outcome = await recordFact(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        field: input.field,
        value: input.value,
        // The zod enum widens `kind` to string; the catalogue is the same list.
        evidence: input.evidence as Parameters<typeof recordFact>[0]["evidence"],
        sourceUrl: input.sourceUrl,
      },
      { userId: ctx.userId, via: ctx.via },
    );
    // A bad address is the caller's mistake and throws. Everything else — below
    // the floor, dismissed before, already applied — is an outcome a background
    // pass must be able to read and move on from, not an exception to retry.
    if (!outcome.ok && outcome.code === "unknown_field") throw new ActionError("invalid", outcome.reason);
    if (!outcome.ok && outcome.code === "unknown_record") throw new ActionError("not_found", outcome.reason);
    return outcome;
  },
  effects: {
    // An applied fact audits itself inside the write path, where the old and new
    // values are known. This covers the other case: a proposal, tagged with the
    // surface that offered it.
    audit: (_input, out, ctx) =>
      !out.ok || out.applied
        ? null
        : {
            key: "fact.proposed",
            objectType: out.fact.entityType,
            objectId: out.fact.entityId,
            meta: {
              via: ctx.via ?? "research",
              factId: out.fact.id,
              field: out.fact.field,
              band: out.fact.band,
            },
          },
  },
});
