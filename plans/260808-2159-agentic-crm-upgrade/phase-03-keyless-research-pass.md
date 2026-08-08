# Phase 3 — Keyless research pass: mail and calendar into evidence

**Size:** L · **Depends on:** Phases 1 + 2 · **Status:** keyless half done (2026-08-09); model-backed lane not started

## Delivered — the keyless half

The headline claim is true and pinned by a test: **with no AI provider
configured at all**, a connected mailbox fills in an empty job title with a
readable reason, and never touches a field a person typed.

`src/lib/research/{signature,identity,domains,config,mail-pass}.ts`, migration
`0015_email_signature` (+ down, reversible in CI), real MIME text extraction in
`src/lib/sync/parse-email.ts`, extract-at-ingest in `src/lib/sync/ingest.ts`, the
`contact.evidence` handler wired into `src/worker/dispatch.ts`, and the
`research.keyless` switch on Settings → Diagnostics. Docs:
`docs/guides/research.md`, a `SECURITY.md` section, an ADR-018 amendment.
Tests: `tests/research-signature.test.ts` (20, pure),
`tests/research-mail-pass.test.ts` (10, real PG), `tests/sync-pull.test.ts` (3),
new MIME cases in `tests/sync.test.ts`, two new cases in
`tests/facts-write-path.test.ts`. Full suite 545 passed, 14 e2e, build green.

### Not built here — the model-backed lane

`session-pass.ts`, `budget.ts`, the `contact.research` / `recheck` handlers, the
egress rules in `src/lib/ai/prompt.ts` and `tests/research-egress.test.ts`.
Everything above works without them; they are the optional second lane. The
egress rules are already written down in **ADR-018 §8** — the tests that enforce
them arrive with the code that could violate them.

### Deviations from this plan, all deliberate

- **`profile.email-match` is never emitted, and one message contributes one
  observation.** The pass selects a contact's messages *by* their address, so
  scoring "this came from their address" at 0.95 would be the pass confirming its
  own query — and would let a single email auto-apply a title, contradicting the
  "a lone signature is PROBABLE" line this plan and ADR-018 both insist on. The
  message that carried the signature contributes the signature and nothing else;
  the second source is a reply on a thread we hold (→ 0.97) or a meeting
  (→ 0.94). ADR-018's "Known and intended" section was amended to say so.
- **A contradiction lands at POSSIBLE, not as a proposal.** Validation below says
  a contradiction "produces a proposal, not a write". Phase 1 shipped
  `CONTRADICTION_CAP = 0.45`, below the 0.55 proposal floor, so it is *stored and
  never surfaced*. That is the stricter reading and the shipped one; the wording
  here was loose.
- **The kill switch gates the extraction, not only the booking.** First cut
  gated the `contact.evidence` task while still writing `signature_*` on every
  sync — which contradicted the `SECURITY.md` wording added in the same change
  ("off stops the reading"). Found in review. Off now means nothing is extracted
  and nothing is stored.
- **A signature must belong to the sender.** Also found in review: the extractor
  read the last paragraph of a mail, so "see below for reference / Jane Doe / VP
  of Sales / jane@customer.example" made the *sender* a VP of Sales, and one
  corroborating source would have auto-applied it. A block now has to carry the
  sender's own address, or follow the RFC 3676 `-- ` delimiter, or name the
  sender. Four fixtures pin it.
- **An undelimited block with only a name and a title yields nothing.** It has no
  phone, website or address to confirm it is a signature at all. A miss costs
  nothing; this is the same bias the rest of the module runs on.
- **The employer domain may come from a work address in the block**, not only a
  website line — a signature with an address and no website is the commoner
  shape, and both resolve by exact domain match.
- **`recordFact()` reuses an open proposal** for the same (record, field, value)
  instead of inserting a second row, and promotes it in place when later evidence
  reaches VERIFIED. Carried from Phase 1, which could leave it out because only a
  human wrote facts.
- **Phase 2's transaction debt is paid here**, as Phase 2 said it should be:
  `pullAccount(workspaceId, accountId)` now owns three short transactions around
  the provider round-trip instead of running inside one. `withAuth` gained a
  sibling, `withAuthOutsideTransaction`, so the "Sync now" route has the same
  shape as the background task.

### Carried forward, deliberately

- **No partial unique index on an open (workspace, entity, kind).** Unchanged
  from Phase 2, but Phase 3 is the first caller that books on every sync rather
  than once, so two mailboxes syncing one contact concurrently could stack two
  `contact.evidence` tasks. Wasted work, not a duplicate fact — `recordFact`
  reuse covers that. The fix is still a `UNIQUE … WHERE finished_at IS NULL`.
- **`needsProvider()` at booking time is still vacuous** — no session kind is
  booked yet. It becomes real with the model-backed lane, which should check it.
- **No backfill.** Research starts from the next sync (Decision 5). A one-shot
  backfill can be an `agent_tasks` kind if anyone asks.

## Why

This is the differentiator. Comp AI's own ranking puts a **signature block** and a **thread reply** above LinkedIn — because a person updates their signature the week they are promoted, and no data vendor can sell you a reply from the person's own address.

Fourty is **partly** there: message metadata (`from_addr`, `to_addrs`, `contact_id`, `sent_at`) and calendar attendees are stored and ready to mine; **signature text is not** — it is discarded at ingest. Thread-reply and meeting-attendance evidence work off what exists today; signature evidence requires the extract-at-ingest work below first.

So the headline is: *Fourty fills in titles, employers and job changes from your own mailbox, with no API key, no vendor, and no LLM.* The model-backed pass is an optional second lane on top.

## Hard prerequisite: Fourty does not store email bodies

Verified against code: `email_messages` keeps only a `snippet` — the first 280 chars of the whitespace-collapsed body (`src/lib/sync/parse-email.ts:74`) — and `parse-email.ts` says of itself *"Not a full MIME decoder."* Signature blocks live at the **end** of a message and are discarded at ingest today. "Parse existing rows" is therefore false on real data; calendar is fine (`calendar_events.attendees` is stored).

**Chosen fix (plan.md Decision 5): extract-at-ingest.** Run signature extraction on the in-memory body during ingest and persist only what was extracted — never the full body. Rejected: storing `body_text` (privacy/storage surface), re-fetching per pass (live tokens, more egress).

**Storage shape, chosen (v1):** four nullable columns on `email_messages` —
`signature_title`, `signature_employer`, `signature_phone`, `signature_raw` (≤500 chars).

```
ingest (in-memory body only)
  → extract signature → write signature_* columns → schedule contact.evidence
contact.evidence
  → read signature_* + headers + calendar attendees
  → emit observations → recordFact()
  → never re-reads raw MIME
```

Why split rather than calling `recordFact()` inline at ingest: re-runs stay idempotent, the extraction is debuggable after the fact, ingest stays fast with a small transaction, and no full body is ever at rest. `signature_raw` is what a rep sees quoted in the rationale — it is the evidence `detail`, so it must be stored, bounded.

Consequences:
- `parse-email.ts` needs real `multipart/alternative` + `text/plain` handling (quoted-printable, base64) before the signature extractor sees the text — with fixtures; it is currently headers + a naive body slice.
- **Historical mail:** research starts from the next sync. No backfill re-fetch in v1; a one-shot backfill can be a later `agent_tasks` kind if demanded.

## Requirements

- The parsing pass is **deterministic and keyless**. No LLM, no network. It runs on the `direct` lane.
- **Default on** once a mailbox is connected; per-workspace kill switch `research.keyless` (plan.md Decision 4). Independent of `AI_PROVIDER`.
- Every write goes through `recordFact()` from Phase 1 as a **class-B** caller: auto-apply only empty + VERIFIED + primary; a job-change against a human-owned field is proposed, never applied. No parser writes a column itself.
- Egress boundary, stated and enforced: (1) no customer text leaves in a third-party query — derived questions only; (2) nothing sensitive is logged, and reading is not logging; (3) only business context reaches a record — never health, politics, religion, sexuality, ethnicity or union membership, whatever a source volunteers.
- The model-backed pass is capability-gated on `AI_PROVIDER` and budget-bounded per session; running out of budget is a **normal ending**, not an error.
- A recheck is booked with a reason the user can read.

## Files

**Create**
- `src/lib/research/signature.ts` — extract a signature block from a message body; return `{ title?, employer?, phone? }` + the quoted line as `detail`.
- `src/lib/research/identity.ts` — match a message/attendee to a contact. **Exact address match only.** No fuzzy name matching, ever.
- `src/lib/research/mail-pass.ts` — the `contact.evidence` handler: read this contact's threads/meetings, emit observations, call `recordFact()`.
- `src/lib/research/session-pass.ts` — the `contact.research` handler (model-backed, optional).
- `src/lib/research/budget.ts` — per-session step/token budget.
- `docs/guides/research.md`. (**ADR-018 is owned by Phase 1** — this phase only extends it with the egress rules and the storage shape.)
- `tests/research-signature.test.ts`, `tests/research-mail-pass.test.ts`, `tests/research-egress.test.ts`.

**Modify**
- `src/lib/sync/parse-email.ts` — real MIME text extraction (multipart/alternative, quoted-printable, base64) feeding the signature extractor; fixtures.
- `src/lib/sync/ingest.ts` — run extraction on the in-memory body, persist structured observations, then schedule `contact.evidence` for the contacts touched (the row is the message).
- `src/lib/agent-tasks/kinds.ts` — wire `contact.evidence` + `contact.research`.
- `src/lib/ai/prompt.ts` — add the egress rules to the model-backed pass's prompt.
- `SECURITY.md` — what is read, what is stored, how to turn it off.

## Observation mapping

| Source in Fourty | Evidence kind | Detail written for a human |
|---|---|---|
| Inbound message from the contact's address, on a thread we hold | `crm.thread-reply` | "they replied on the Renewal thread, 14 July" |
| Signature block in a message they sent | `crm.signature-block` | `their signature on 14 July reads "Head of Security, Acme"` |
| Accepted calendar invite | `crm.meeting-attendance` | "they accepted the QBR invite on 2 June" |
| Two sources disagree on employer | `contradiction` | "signature says Acme, mail domain says Fernhill" |

Fields written are `job_title` and `company_id` (exact domain resolution only — Phase 1 step 5); there is no `employer` column and no free-text employer field. A job change surfaces as a `SUPERSEDED` → `APPLIED` transition on `field='company_id'`; the timeline entry falls out of the ledger, no extra table.

Recall from Phase 1: a lone `crm.signature-block` (0.80) is PROBABLE — a proposal, not a write. Title auto-fill happens when the signature combines with another primary source on the same contact.

## Steps

1. Signature extraction first, with fixtures. It is the highest-value parser and the easiest to get subtly wrong (quoted replies, disclaimers, mobile footers, non-Latin scripts). Table-driven fixtures; no regex sprawl in the handler.
2. Identity: exact address only. A contact with no email is not matched, full stop — a wrong record about a real person is worse than a blank field.
3. `mail-pass`: bounded per run (N contacts, M messages each), idempotent — re-running yields "already on the record, nothing changed", not a duplicate. **Carried from Phase 1:** the ledger has no uniqueness constraint on an open proposal, so nothing stops a re-run stacking identical PROPOSED rows for the same (entity, field, value). Phase 1 accepted that because only a human wrote facts; a pass that runs on a schedule must reuse the open proposal (refresh its evidence and `observed_at`) rather than add a second one.
4. Field permissions and RLS apply to every read the pass makes.
5. Model-backed pass last, and only for what parsing cannot do (a written brief, reconciling a contradiction into a question for a rep). It gets the Phase 0 capability block, the workspace block, the egress rules, and a budget. It books its own `recheck` with a reason.
6. Egress tests: (a) no synced message body or subject can appear in an outbound provider request payload — derived fields only; (b) no body text in logs (pino field allowlist on the research handlers); (c) MCP/AI evidence tools return observations and rationales, never raw mail.

## Validation

- `npm test -- research` then full suite.
- **The keyless claim, end-to-end:** with `AI_PROVIDER` unset, seed a mailbox with a signature block, run the pass, assert the title lands as VERIFIED on the contact with a readable rationale.
- Idempotency: two runs, one fact.
- Egress: property-style test over the outbound payload builder.
- A contradiction holds the field and produces a proposal, not a write.

## Risks

- **Signature parsing precision** — bias to *not* extracting. A missed title costs nothing; a wrong one lands on a customer record. Fixtures include at least one deliberately ambiguous footer that must yield nothing.
- **Privacy expectations** — the pass reads full message bodies. It is the user's own tenant data and RLS-scoped, but it must be documented in `docs/guides/research.md` and `SECURITY.md`, and it must be switchable off per workspace.
- **Volume** — cap per pass and per contact; a large mailbox must not turn a sync into an hour of parsing.
