# Phase 1 — Evidence ledger + suggestion inbox

**Size:** M · **Depends on:** Phase 0 · **Blocks:** Phase 3, Phase 5

## Why

Fourty's only AI safety mechanism is *a human clicks confirm in chat*. That does not survive contact with background work: nobody is watching, and a model asked to grade its own certainty will do so, confidently, in the direction that makes it look useful. The fix is to never accept a confidence — accept an **observation**, and price it in code.

This is the same philosophy Fourty already ships for lead scoring ("pure functions you can tune"), applied to writes.

**[ADR-018](../../docs/adr/018-evidence-and-research.md) is written and Accepted (2026-08-09) — ahead of this phase, not inside it.** The migration below implements it; a divergence from the ADR is a bug in the migration, not a licence to amend the ADR in passing. VERIFIED auto-apply is a strategy change against ADR-015 (stop-at-write) and ADR-016 guardrail #4 ("AI drafts; a human commits", binding). The carve-out per plan.md Decision 2: only deterministic class-B research applies, only to empty fields, with Revert; generative writes stay propose-only. Background research is then "mailbox mining with the same pure-function discipline as lead scoring" (Tier-2 DNA), not a betrayal of stop-at-write.

## Requirements

- No tool may pass a score, a confidence, or a bare `sourceUrl` offered as proof. It passes `{ kind, detail, sourceUrl? }` where `kind` is a closed enum of things one can *observe*.
- Scoring is a pure function: combination `1 − Π(1−wᵢ)`, ceiling 0.99, a `contradiction` entry caps the result at 0.45 rather than reducing it.
- Bands are behaviour, not labels: **VERIFIED** (≥0.85 **and** at least one primary source) → applied to the record **only for a class-B (deterministic) caller on an empty field**; a class-A (generative) caller caps at PROPOSED whatever the band. **PROBABLE** (≥0.55) → proposed for a human; **POSSIBLE** (≥0.3) → stored, not surfaced; below → not stored.
- Three invariants enforced in the transaction, not the prompt: **never overwrite a human**, **never re-offer a dismissed value**, **never apply without a primary source**.
- Applying supersedes the previous applied fact rather than deleting it — which is how "changed employer in March" is answerable for free.

## Files

**Create**
- `src/lib/facts/evidence.ts` — `EvidenceKind`, `WEIGHTS`, `scoreEvidence()`, `bandFor()`. Pure, no imports from `@/db`.
- `src/lib/facts/record-fact.ts` — the single write path.
- `src/lib/facts/fields.ts` — the fact-field catalogue and its mapping to real columns / custom fields.
- `drizzle/00XX_record_facts.sql` (+ down) — `record_facts` table.
- `src/app/api/facts/route.ts`, `src/app/api/facts/[id]/route.ts` — list proposals, accept/dismiss.
- `src/components/fact-suggestion.tsx` — the under-field suggestion chip with its rationale tooltip.
- `tests/facts-evidence.test.ts` (pure), `tests/facts-write-path.test.ts` (real PG).

**Modify**
- `src/db/schema.ts` — add `recordFacts`.
- `src/lib/actions/registry.ts` + `src/lib/actions/adapters/*` — expose `record_fact` / `list_fact_suggestions` / `decide_fact` once, over REST + GraphQL + MCP + AI (this is what ADR-017 is for).
- `src/app/(app)/contacts/[id]/contact-detail.tsx`, `companies/[id]/company-detail.tsx` — render suggestions under empty fields.
- `src/lib/audit.ts` call sites — an applied (class-B) fact audits `via:"research"` with `actorId: null`; a class-A proposal audits `via:"ai"`; a human decision audits the human.

## Schema

```
record_facts
  id, workspace_id
  entity_type, entity_id          -- polymorphic from day one; contacts + companies in v1
  field                           -- 'job_title' | 'company_id' | 'linkedin' | … | 'cf:<customFieldId>'
                                  -- names match src/db/schema.ts contacts columns, not Comp AI's
  value
  score real, band                -- VERIFIED | PROBABLE | POSSIBLE
  evidence jsonb                  -- the observations, as given
  method, source_url
  status                          -- PROPOSED | APPLIED | DISMISSED | SUPERSEDED
  decided_by, decided_at
  observed_at, superseded_at
  index (workspace_id, entity_type, entity_id, field, status)
  index (workspace_id, status, observed_at)
```

RLS policy identical to every other tenant table. `evidence` is data, never rendered as HTML.

## Evidence kinds (v1)

Primary (may carry a fact alone — each *identifies this person*):
`crm.thread-reply` .85 · `crm.signature-block` .80 · `profile.email-match` .95 · `crm.meeting-attendance` .70

Supporting: `web.cited-claim` .40 · `handle.name-form` .35 · `search.cites-profile` .35 · `employer-only` .20 · `contradiction` 0 (holds)

`linkedin.employer-and-name` / `github.account-identity` are reserved for a later vendor capability — the enum ships with them, the tools do not.

## Steps

1. Pure module + its test first. One entry per **independent** source: two facts on one page are one observation. Test that the combination is order-independent and that a contradiction holds rather than nudges.
2. Migration + RLS + reversibility check.
3. `recordFact()` in one transaction: empty → reject; below floor → reject with *find a source, do not raise the score*; dismissed-same-value → reject; already-applied-same-value → no-op; human-owns → reject naming the field; else insert, and if VERIFIED **and** the caller is class B (deterministic) supersede + write the column. Class-A (generative) callers cap at PROPOSED regardless of band.
4. "Human owns", without a new column: non-null column with no APPLIED fact matching the current value → human/import owns; current value equals the latest APPLIED fact → research owns and may supersede; a human edits after an apply → value diverges → human owns again. Pin all three with real-PG tests — this is the whole safety claim.
5. **`company_id` resolution, not an employer string.** An employer observation applies only when it resolves to an existing company by **exact domain match** (v1); otherwise it is stored as a PROBABLE text proposal for a rep. A wrong `company_id` is worse than an empty field.
6. **Revert.** Every APPLIED fact row shows a one-click Revert: restore the previous value from the SUPERSEDED fact (or clear if none), mark the reverted value DISMISSED so the invariants block re-offer, append `fact.reverted` to audit with `{ via:"human", previousFactId, field, old, new }`. Reversal is a new decision, never a deleted audit row.
7. Audit actors: an applied class-B fact audits `audit(null, …, { meta: { via:"research", factId } })` — `actorId` is nullable by design (`src/lib/audit.ts`); never fake a user. A human decision audits the human.
8. Action-registry entries so all four APIs get it from one definition.
9. UI: an empty field with a proposal shows the value, the rationale in plain words ("their signature on 14 July reads …"), and Accept / Dismiss. Dismiss is permanent for that exact value.

## Validation

- `npm test -- facts` then full suite (real Postgres — "never overwrite a human" is only true if the transaction says so).
- Cases pinned: human-owned field, dismissed value re-offered, contradiction, superseding an applied fact, cross-workspace isolation (a fact in workspace A invisible to B).
- Ship cases, one test each:
  - class-A caller + VERIFIED band → PROPOSED, column unchanged
  - class-B + empty + VERIFIED → APPLIED + audit `via:"research"`
  - Revert → previous value restored + reverted value DISMISSED + `fact.reverted` appended
  - `company_id`: exact domain → applied; name-only match → PROBABLE text proposal, no link
  - human edits after an apply → value diverges → human owns → next observation does not overwrite

### Known and intended: signature alone does not auto-fill

`crm.signature-block` is 0.80, so a lone signature lands **PROBABLE** — a chip, not a write. It reaches VERIFIED only combined with another primary source (e.g. `profile.email-match` → ~0.99). This is correct and must be **stated in ADR-018**, so nobody raises the weight to make a demo look better. If signature-only auto-apply is ever wanted, it needs its own primary+kind allowlist rule — not a weight bump, and not in v1.
- Migration up/down in CI.

## Risks

- **Polymorphic entity vs contact-only** — polymorphic costs one composite index and buys companies + custom objects. Chosen deliberately; if it complicates the write path, ship contacts first and keep the columns.
- **Suggestion fatigue** — POSSIBLE is stored and never shown, on purpose. Only PROBABLE reaches a human.
- **Field permissions** — a proposal for a field the viewer cannot see must not be listed. Reuse `src/lib/field-permissions.ts`, do not re-implement.
