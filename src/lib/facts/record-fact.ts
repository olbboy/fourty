import { and, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { assess, type Band, type Evidence } from "./evidence";
import {
  currentValue,
  fieldLabel,
  knownFields,
  loadTarget,
  permissionField,
  resolveCompanyValue,
  resolveField,
  writeValue,
  type FactEntity,
  type ResolvedField,
} from "./fields";

/**
 * The single write path for the evidence ledger (ADR-018).
 *
 * The three invariants live here, in the transaction, not in a prompt:
 *
 *   1. **Never overwrite a human.** A value a person or an import put there
 *      outranks anything found. A value a previous applied fact put there does
 *      not — the pass may correct itself, which is also what makes a job change
 *      visible as SUPERSEDED → APPLIED.
 *   2. **Never re-offer a dismissal.** A dismissed exact value is dismissed
 *      forever.
 *   3. **Never apply without a primary source.** Supporting evidence may combine
 *      to PROBABLE; it may never reach VERIFIED alone.
 *
 * Nothing here looks for more evidence to push a claim over a line. A proposal
 * is a correct outcome.
 */

export type FactStatus = "PROPOSED" | "APPLIED" | "DISMISSED" | "SUPERSEDED";

export type FactRow = typeof tables.recordFacts.$inferSelect;

/**
 * Who is recording. The write class, not the caller's identity, decides whether
 * anything may be applied (ADR-018 §3).
 *
 * - **A — generative**: chat, model-backed research, custom agents. Never
 *   writes a field, and its band is capped at PROBABLE whatever the evidence
 *   says, because a model chose the observations.
 * - **B — deterministic**: pure parsers plus this ledger. May apply, under
 *   every constraint below.
 * - **C — human**: the UI, an import, or an API caller acting as a user. A
 *   human recording an observation is still recording an observation — the
 *   field write is their own decision, made by accepting the proposal.
 */
export type WriteClass = "A" | "B" | "C";

/** `via` is what the surfaces already carry; this is the only place it decides anything. */
export function writeClassFor(via: string | undefined): WriteClass {
  if (via === "research") return "B";
  if (via === "ai" || via?.startsWith("agent:")) return "A";
  return "C";
}

export type RecordFactInput = {
  entityType: FactEntity;
  entityId: string;
  field: string;
  value: string;
  evidence: Evidence[];
  sourceUrl?: string;
};

export type RecordFactContext = { userId: string | null; via?: string };

export type RecordFactOutcome =
  | { ok: true; fact: FactRow; applied: boolean; reason: string }
  | { ok: false; reason: string; code: FactRejection };

export type FactRejection =
  | "unknown_field"
  | "unknown_record"
  | "empty_value"
  | "below_floor"
  | "dismissed"
  | "already_applied";

/**
 * Record an observation about a field, and apply it only when every constraint
 * says so. One transaction: the caller's `withWorkspace()`.
 */
export async function recordFact(
  input: RecordFactInput,
  ctx: RecordFactContext,
): Promise<RecordFactOutcome> {
  const resolved = await resolveField(input.entityType, input.field);
  if (!resolved) {
    return {
      ok: false,
      code: "unknown_field",
      reason: `No such fact field "${input.field}" on a ${input.entityType}. Known: ${knownFields(input.entityType).join(", ")}.`,
    };
  }

  const target = await loadTarget(input.entityType, input.entityId);
  if (!target) return { ok: false, code: "unknown_record", reason: `No such ${input.entityType}.` };

  const rawValue = input.value.trim();
  if (!rawValue) {
    return { ok: false, code: "empty_value", reason: "A fact needs a value. Nothing is not an observation." };
  }

  const klass = writeClassFor(ctx.via);
  const assessment = assess(input.evidence);
  if (!assessment.band) {
    return {
      ok: false,
      code: "below_floor",
      reason: `Scored ${assessment.score} — below the floor to store anything. Find another independent source; do not raise the score.`,
    };
  }

  // An employer observation becomes a link only on an exact match. Anything
  // else stays a text proposal a rep settles — a wrong company_id is worse than
  // an empty one.
  let value = rawValue;
  let unresolvedCompany: string | null = null;
  if (resolved.kind === "column" && resolved.spec.reference === "company") {
    const resolution = await resolveCompanyValue(rawValue);
    if (resolution.resolved) value = resolution.companyId;
    else unresolvedCompany = resolution.reason;
  }

  const band = cappedBand(assessment.band, klass, unresolvedCompany !== null);

  const existing = await factsFor(input.entityType, input.entityId, input.field);
  if (existing.some((f) => f.status === "DISMISSED" && f.value === value)) {
    return {
      ok: false,
      code: "dismissed",
      reason: `"${value}" was dismissed for this field. A dismissal is permanent for that exact value.`,
    };
  }
  const applied = existing.find((f) => f.status === "APPLIED");
  if (applied?.value === value) {
    return { ok: false, code: "already_applied", reason: "Already applied, with the same value." };
  }

  const owner = ownerOf(currentValue(resolved, target), applied ?? null);
  const canApply =
    klass === "B" && band === "VERIFIED" && assessment.hasPrimary && owner !== "human";

  const now = Date.now();
  const fact: typeof tables.recordFacts.$inferInsert = {
    id: newId(),
    entityType: input.entityType,
    entityId: input.entityId,
    field: input.field,
    value,
    previousValue: canApply ? currentValue(resolved, target) : null,
    score: assessment.score,
    band,
    evidence: JSON.stringify(assessment.evidence),
    method: ctx.via ?? "research",
    sourceUrl: input.sourceUrl ?? null,
    status: canApply ? "APPLIED" : "PROPOSED",
    decidedBy: null,
    decidedAt: canApply ? now : null,
    observedAt: now,
  };
  await db.insert(tables.recordFacts).values(fact);

  if (!canApply) {
    return {
      ok: true,
      fact: (await factById(fact.id))!,
      applied: false,
      reason: notAppliedReason({ klass, band, owner, unresolvedCompany, field: fieldLabel(resolved) }),
    };
  }

  // Applying supersedes rather than deletes, so "changed employer in March" is
  // answerable from the ledger with its date and its source, and no extra table.
  if (applied) {
    await db
      .update(tables.recordFacts)
      .set({ status: "SUPERSEDED", supersededAt: now })
      .where(eq(tables.recordFacts.id, applied.id));
  }
  await writeValue(resolved, target, value);
  await logActivity({
    type: "updated",
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: null,
    meta: { fields: [permissionField(resolved)], via: "research" },
  });
  // actorId stays null: no background path invents a user (ADR-018 §6).
  await audit(null, "fact.applied", {
    objectType: input.entityType,
    objectId: input.entityId,
    meta: {
      via: "research",
      factId: fact.id,
      field: input.field,
      old: fact.previousValue,
      new: value,
      score: assessment.score,
    },
  });

  return {
    ok: true,
    fact: (await factById(fact.id))!,
    applied: true,
    reason: applied
      ? `Applied, superseding "${applied.value}" — the pass correcting its own earlier value.`
      : "Applied to an empty field.",
  };
}

/**
 * A generative caller caps at PROBABLE whatever the evidence says (ADR-018 §3):
 * a model chose the observations, so the band it produces is not a band anything
 * may act on. An unresolved employer caps there too — the claim may be right,
 * but "Fernhill" is not a company link.
 *
 * A class-C human is not capped: their observation is priced honestly, and the
 * reason it is not applied is that only a deterministic pass applies anything —
 * they commit it by accepting it, which is ADR-015's loop, unchanged.
 */
function cappedBand(band: Band, klass: WriteClass, unresolvedCompany: boolean): Band {
  const capped = klass === "A" ? demote(band) : band;
  return unresolvedCompany ? demote(capped) : capped;
}

function demote(band: Band): Band {
  return band === "VERIFIED" ? "PROBABLE" : band;
}

export type FieldOwner = "empty" | "research" | "human";

/**
 * Ownership is derived, not stored — there is no `is_human_edited` column.
 *
 * | State                                                   | Owner    |
 * |---------------------------------------------------------|----------|
 * | Column empty                                            | empty    |
 * | Column equals a fact the pass applied itself            | research |
 * | Anything else (typed, imported, or a human's Accept)    | human    |
 *
 * A human's Accept counts as human: they endorsed that value, and a later pass
 * must not quietly replace what someone signed off on.
 */
export function ownerOf(current: string | null, applied: FactRow | null): FieldOwner {
  if (current === null) return "empty";
  if (applied && applied.value === current && applied.decidedBy === null) return "research";
  return "human";
}

function notAppliedReason(args: {
  klass: WriteClass;
  band: Band;
  owner: FieldOwner;
  unresolvedCompany: string | null;
  field: string;
}): string {
  if (args.unresolvedCompany) return args.unresolvedCompany;
  if (args.owner === "human") return `${args.field} was set by a person — proposed, not applied.`;
  if (args.klass !== "B") return "Recorded as a proposal: only a deterministic pass may fill a field.";
  if (args.band !== "VERIFIED") return `Scored ${args.band} — a proposal for a human, not a write.`;
  return "Recorded as a proposal.";
}

// ── Reading ──────────────────────────────────────────────────────────────────

async function factsFor(entityType: string, entityId: string, field: string): Promise<FactRow[]> {
  return db
    .select()
    .from(tables.recordFacts)
    .where(
      and(
        eq(tables.recordFacts.entityType, entityType),
        eq(tables.recordFacts.entityId, entityId),
        eq(tables.recordFacts.field, field),
      ),
    )
    .orderBy(desc(tables.recordFacts.observedAt));
}

export async function factById(id: string): Promise<FactRow | null> {
  const [row] = await db.select().from(tables.recordFacts).where(eq(tables.recordFacts.id, id)).limit(1);
  return row ?? null;
}

export type ListFactsInput = {
  entityType?: FactEntity;
  entityId?: string;
  status?: FactStatus;
  limit?: number;
};

/**
 * What is waiting for a human, newest first. POSSIBLE rows are stored and never
 * listed — suggestion fatigue is the failure mode that makes a rep stop reading
 * suggestions at all, so only PROBABLE and above reaches one.
 */
export async function listFacts(input: ListFactsInput): Promise<FactRow[]> {
  const status = input.status ?? "PROPOSED";
  const where = [eq(tables.recordFacts.status, status)];
  if (input.entityType) where.push(eq(tables.recordFacts.entityType, input.entityType));
  if (input.entityId) where.push(eq(tables.recordFacts.entityId, input.entityId));
  if (status === "PROPOSED") where.push(inArray(tables.recordFacts.band, ["VERIFIED", "PROBABLE"]));
  return db
    .select()
    .from(tables.recordFacts)
    .where(and(...where))
    .orderBy(desc(tables.recordFacts.observedAt))
    .limit(Math.min(input.limit ?? 100, 200));
}

// ── Deciding ─────────────────────────────────────────────────────────────────

export type Decision = "accept" | "dismiss" | "revert";

export type DecideOutcome =
  | { ok: true; fact: FactRow; reason: string }
  | { ok: false; reason: string; code: "unknown_fact" | "wrong_status" | "unknown_field" | "unknown_record" };

/**
 * A human's decision on a fact. Accepting writes the value as *their* write —
 * `decided_by` is set, so ownership derivation reads the field as human-owned
 * from then on and no later pass overwrites what they signed off on.
 *
 * Reverting is a new decision, never a deleted audit row (ADR-005): the previous
 * value comes back, the reverted value is DISMISSED so invariant 2 blocks a
 * re-offer, and `fact.reverted` is appended.
 */
export async function decideFact(
  id: string,
  decision: Decision,
  ctx: RecordFactContext,
): Promise<DecideOutcome> {
  const fact = await factById(id);
  if (!fact) return { ok: false, code: "unknown_fact", reason: "No such fact." };

  const wanted: Record<Decision, FactStatus[]> = {
    accept: ["PROPOSED"],
    dismiss: ["PROPOSED"],
    revert: ["APPLIED"],
  };
  if (!wanted[decision].includes(fact.status as FactStatus)) {
    return {
      ok: false,
      code: "wrong_status",
      reason: `Cannot ${decision} a fact that is ${fact.status}.`,
    };
  }

  const resolved = await resolveField(fact.entityType as FactEntity, fact.field);
  if (!resolved) return { ok: false, code: "unknown_field", reason: "That field no longer exists." };
  const target = await loadTarget(fact.entityType as FactEntity, fact.entityId);
  if (!target) return { ok: false, code: "unknown_record", reason: "That record no longer exists." };

  const now = Date.now();
  if (decision === "dismiss") {
    await db
      .update(tables.recordFacts)
      .set({ status: "DISMISSED", decidedBy: ctx.userId, decidedAt: now })
      .where(eq(tables.recordFacts.id, id));
    await audit(ctx.userId, "fact.dismissed", {
      objectType: fact.entityType,
      objectId: fact.entityId,
      meta: { factId: id, field: fact.field, value: fact.value },
    });
    return { ok: true, fact: (await factById(id))!, reason: "Dismissed — this exact value will not be offered again." };
  }

  if (decision === "accept") {
    return acceptFact(fact, resolved, target, ctx, now);
  }
  return revertFact(fact, resolved, target, ctx, now);
}

async function acceptFact(
  fact: FactRow,
  resolved: ResolvedField,
  target: Awaited<ReturnType<typeof loadTarget>> & object,
  ctx: RecordFactContext,
  now: number,
): Promise<DecideOutcome> {
  const previous = currentValue(resolved, target);
  const applied = (await factsFor(fact.entityType, fact.entityId, fact.field)).find(
    (f) => f.status === "APPLIED",
  );
  if (applied) {
    await db
      .update(tables.recordFacts)
      .set({ status: "SUPERSEDED", supersededAt: now })
      .where(eq(tables.recordFacts.id, applied.id));
  }
  await writeValue(resolved, target, fact.value);
  await db
    .update(tables.recordFacts)
    .set({ status: "APPLIED", decidedBy: ctx.userId, decidedAt: now, previousValue: previous })
    .where(eq(tables.recordFacts.id, fact.id));
  await logActivity({
    type: "updated",
    entityType: fact.entityType,
    entityId: fact.entityId,
    actorId: ctx.userId,
    meta: { fields: [permissionField(resolved)] },
  });
  await audit(ctx.userId, "fact.accepted", {
    objectType: fact.entityType,
    objectId: fact.entityId,
    meta: { factId: fact.id, field: fact.field, old: previous, new: fact.value },
  });
  return { ok: true, fact: (await factById(fact.id))!, reason: "Accepted and written." };
}

async function revertFact(
  fact: FactRow,
  resolved: ResolvedField,
  target: Awaited<ReturnType<typeof loadTarget>> & object,
  ctx: RecordFactContext,
  now: number,
): Promise<DecideOutcome> {
  const restored = fact.previousValue;
  await writeValue(resolved, target, restored);
  // The reverted value is dismissed, not deleted: that is what stops the next
  // pass from finding the same evidence and offering it straight back.
  await db
    .update(tables.recordFacts)
    .set({ status: "DISMISSED", decidedBy: ctx.userId, decidedAt: now })
    .where(eq(tables.recordFacts.id, fact.id));

  // If the value we restored is one the pass had applied before, hand ownership
  // back to it, so the ledger and the column still agree about who owns the field.
  if (restored !== null) {
    const previousFact = (await factsFor(fact.entityType, fact.entityId, fact.field)).find(
      (f) => f.status === "SUPERSEDED" && f.value === restored,
    );
    if (previousFact) {
      await db
        .update(tables.recordFacts)
        .set({ status: "APPLIED", supersededAt: null })
        .where(eq(tables.recordFacts.id, previousFact.id));
    }
  }

  await audit(ctx.userId, "fact.reverted", {
    objectType: fact.entityType,
    objectId: fact.entityId,
    meta: { via: "human", previousFactId: fact.id, field: fact.field, old: fact.value, new: restored },
  });
  return {
    ok: true,
    fact: (await factById(fact.id))!,
    reason: restored === null ? "Reverted — the field is empty again." : `Reverted to "${restored}".`,
  };
}
