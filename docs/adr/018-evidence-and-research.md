# ADR-018 — Evidence, not confidence: how a background pass may write to a record

**Status:** Accepted · **Date:** 2026-08-09

> **Relationship to ADR-015 and ADR-016 — this ADR narrows one guardrail.**
> ADR-016 guardrail #4 reads *"Human-in-the-loop — AI drafts; a human commits to
> the system of record."* ADR-015 states *"a mis-parsed intent must never silently
> mutate data, so writes are structurally human-confirmed."*
>
> This ADR keeps both **for everything a model touches**, and carves out one
> narrow class that contains no model at all: a deterministic parser whose output
> is priced by a pure function. Guardrail #4 is hereby **scoped to generative
> paths** rather than deleted. The carve-out was written this way because the
> lawyerly reading — *"a regex is not AI, so #4 does not apply"* — is true and
> insufficient: the spirit of #4 is that nothing silently mutates the system of
> record, and that spirit is honoured below by four mechanisms
> (never-over-a-human, VERIFIED-with-primary, one-click revert, audited), not by
> an argument about definitions.
>
> Note also that this ADR *fulfils* ADR-016 guardrail #2 (*"Determinism-first —
> prefer a rule to an LLM wherever a rule suffices"*): the pass that writes is the
> one with no LLM in it.

## Context

Fourty's only AI write-safety mechanism today is ADR-015's stop-at-write loop: a
human clicks confirm in chat. That mechanism does not survive contact with
background work, because nobody is watching a background pass.

The naive fix — let a model attach a confidence score and write above a threshold
— fails for a documented reason: a model asked to grade its own certainty will do
so, and will be wrong in the direction that makes it look useful. A confidently
wrong fact about a customer is worse than a blank field, because nobody can tell
it is wrong.

Meanwhile Fourty already ingests mail and calendar (ADR-009) and mines nothing
from them. The best identity evidence available needs no vendor and no key: a
person updates their **email signature** the week they are promoted, and a
**reply from their own address** proves an identity outright. That is the
capability this ADR exists to make safe.

Prior art: `trycompai/crm` (MIT) ships an evidence ledger of exactly this shape.
The *idea* is portable; their stack (Prisma, a separate agent deployment, Vercel
Sandbox) is not, and none of it is adopted here.

## Decision

### 1. No caller may assert a confidence

A tool reports **what it observed**, never how sure it is. The observation is a
closed enum; a pure function prices it. `score`, `confidence` and a bare
`sourceUrl`-offered-as-proof are not accepted parameters anywhere in the write
path.

```
Evidence = { kind: EvidenceKind, detail: string, sourceUrl?: string }
```

Scoring is `1 − Π(1 − wᵢ)` over independent observations, ceiling 0.99. A
`contradiction` entry does not reduce the score a little — it **caps it at 0.45**,
which holds the fact entirely. A profile saying one employer while a mail header
says another is not 60% true; it is unresolved, and a human should see it as such.

**One entry per independent source.** Two facts on one page are one observation.
Splitting a single page into two entries double-counts it into false certainty,
which is precisely the arithmetic this design exists to prevent.

### 2. Bands are behaviour, not labels

| Band | Floor | What happens |
|---|---|---|
| VERIFIED | ≥0.85 **and** ≥1 primary source | Applied to the record — **class B only, never over a human's value** (§3) |
| PROBABLE | ≥0.55 | Stored as a proposal for a human |
| POSSIBLE | ≥0.30 | Stored, never surfaced |
| — | below | Not stored |

A proposal is a **correct outcome**, not a failure. Four people named Marchetti
work at Fernhill and a human settles that in three seconds. Nothing in the system
may "look for more evidence" to push a claim over a line.

### 3. Three write classes; only one may apply

| Class | Who | May write a field? |
|---|---|---|
| **A — generative** | Chat (ADR-015), model-backed research, custom agents | **Never.** Caps at PROBABLE whatever the band. ADR-015's loop is unchanged. |
| **B — deterministic** | Pure parsers + the ledger (signature, thread-reply, meeting attendance) | **Only** when the field is **not human-owned** (empty, or holding this pass's own applied value — see §4) **and** band is VERIFIED **and** ≥1 primary source. |
| **C — human** | UI, import, REST/GraphQL/MCP as a user | Normal writes. |

Class B is not "the AI writing to the CRM". It is mailbox mining held to the same
pure-function discipline as ADR-016's Tier-2 deal scoring — the difference being
that a score is derived from rows we own, while a fact is derived from text a
person sent us, which is why the further constraints below exist.

### 4. Three invariants the transaction enforces, not the prompt

1. **Never overwrite a human.** A value a person or an import put there outranks
   anything found. A value a *previous applied fact* put there does not — the
   pass may correct itself, and §3's gate is therefore "not human-owned", not
   "empty". Freezing a field after the first apply would leave a wrong title in
   place until someone reverted it by hand, and would delete §5's job-change
   detection, which *is* a SUPERSEDED → APPLIED transition.
2. **Never re-offer a dismissal.** A dismissed exact value is dismissed forever.
3. **Never apply without a primary source.** Supporting evidence may combine to
   PROBABLE; it may never reach VERIFIED alone.

**Ownership is derived, not stored** — no `is_human_edited` column:

| State | Owner |
|---|---|
| Column non-null, no APPLIED fact matching its current value | human / import |
| Column equals the latest APPLIED fact | research — may supersede |
| A human edits after an apply → value diverges | human again |

### 5. Applying supersedes; reverting is a new decision

An apply marks the previous fact `SUPERSEDED` rather than deleting it. Job-change
detection therefore falls out of the ledger for free — a `SUPERSEDED → APPLIED`
transition on `company_id` *is* the change, with its date and its source.

Every APPLIED fact carries a one-click **Revert**: restore the previous value (or
clear it), mark the reverted value DISMISSED so invariant 2 blocks re-offer, and
append `fact.reverted` to the audit log. The audit log is append-only by
construction (ADR-005, migration `0004_audit_rls`); a reversal is a new row, never
a deleted one.

### 6. Attribution

| Path | `actorId` | `via` |
|---|---|---|
| Class B apply | `null` | `research` |
| Class A proposal | `null` (or the caller) | `ai` |
| Custom agent (Phase 5, if ever) | `null` | `agent:<versionId>` |
| Human decision | the user | default |

`actorId` is already nullable (`src/lib/audit.ts`). No background path invents a
user.

### 7. Fields are real columns

The catalogue maps to `src/db/schema.ts` and nothing else: `job_title`,
`company_id`, `linkedin`, and `cf:<customFieldId>` for custom fields.

**There is no `employer` string field and there must never be one** — it would
drift from `companies` within a quarter. An employer observation applies only
when it resolves to an existing company by **exact domain match**; anything else
is a PROBABLE text proposal a human settles. A wrong `company_id` is worse than
an empty one.

### 8. Egress is the boundary, not reading

The pass may read everything in its own tenant, including full message bodies —
that is what makes a signature block usable. The rules govern what *leaves*:

1. **No customer text in a third-party query.** Derived questions only, never a
   pasted thread or sentence.
2. **Nothing sensitive is logged.** Reading is not logging.
3. **Business context only on a record** — name, title, employer, tenure, public
   profile. Never health, politics, religion, sexuality, ethnicity or union
   membership, whatever a source volunteers.

### 9. No email body at rest

Signature extraction runs **at ingest, on the in-memory body**. What persists is
the extraction, never the message: `signature_title`, `signature_employer`,
`signature_phone`, `signature_raw` (≤500 chars) on `email_messages`.
`signature_raw` is stored because it *is* the evidence `detail` a rep reads in the
tooltip — a rationale with nothing to quote is not a rationale.

The evidence pass reads those columns; it never re-reads raw MIME. Re-runs are
therefore idempotent, ingest stays a small transaction, and Fourty does not become
a mail archive.

## Known and intended: a signature alone does not auto-fill

`crm.signature-block` weighs 0.80 → **PROBABLE**. A lone signature produces a
proposal, not a write. It reaches VERIFIED only combined with another primary
source.

In the shipped mail pass that second source is `crm.thread-reply` (→ 0.97) or
`crm.meeting-attendance` (→ 0.94). It is deliberately **not**
`profile.email-match`: the pass selects a contact's messages *by* their address,
so counting "this came from their address" as evidence would be the pass
confirming its own query, and would let a single email auto-apply a title. For
the same reason a message contributes exactly one observation — the one that
carried the signature contributes the signature and nothing else.

This is stated here so that nobody raises the weight to make a demo look better.
If signature-only auto-apply is ever wanted, it needs its own explicit
primary-kind allowlist rule and its own amendment — **not** a weight bump.

## Alternatives rejected

| Option | Why rejected |
|---|---|
| Let the model attach a confidence and write above a threshold | The failure this ADR exists to prevent. Self-graded certainty is wrong in the flattering direction. |
| Propose-only for everything; no background apply at all | Safe and useless. The differentiator degrades to a chip inbox a rep must clear by hand, which is the manual data entry we set out to remove. |
| Auto-apply over a **human-owned** value when the score is high | Breaks invariant 1. A rep who typed a title and finds it changed will not trust the field again, and correctly. (Superseding the pass's *own* earlier value is a different case, and is allowed — §4.) |
| A `confidence` column instead of an evidence array | Loses the rationale. A rep asked to accept a suggestion needs to read *why*, not a number. |
| Store full message bodies and parse later | Turns a CRM into a mail archive: a much larger privacy and storage surface for a parse we can do once, at ingest. |
| Free-text `employer` alongside `company_id` | Two sources of truth for the same fact; drifts from `companies` immediately. |

## Consequences

**Gained**
- A background pass can keep records true without a human watching, and without
  ADR-015's loop being weakened for anything a model touches.
- Job-change detection with a date and a source, from the ledger, with no extra
  table.
- The claim *"fills in contacts from your own mailbox, with no API key, no vendor
  and no LLM"* becomes true and testable — and Fourty can expose the whole
  evidence surface over MCP (ADR-010), which a chat-only competitor cannot.
- Guardrail #2 is honoured where it matters most: the path that writes is the
  deterministic one.

**Costs / risks**
- **Guardrail #4 is genuinely narrowed.** Anyone reading ADR-016 alone will
  conclude Fourty never writes without a human. This ADR is the amendment; the
  two must be read together, and ADR-016 carries a pointer here.
- **Signature extraction precision is the sharp edge.** A missed title costs
  nothing; a wrong one lands on a customer record. The parser must bias to
  extracting nothing — quoted replies, disclaimers and mobile footers all look
  like signatures. Fixtures must include an ambiguous footer that is required to
  yield nothing.
- **`parse-email.ts` is not a MIME decoder** and says so. Real
  `multipart/alternative` + quoted-printable/base64 handling is a prerequisite,
  not a detail.
- **The weights are a judgement, pinned by tests, not a measurement.** They encode
  which sources have proven reliable, and will need revisiting with evidence —
  which means a changed weight is a decision with a test diff, not a tuning knob.
- **Reading full bodies at ingest is a privacy expectation to document**, even
  though the data is the tenant's own and RLS-scoped. `SECURITY.md` and the
  research guide must state what is read, what is kept, and how to switch it off.
- The ledger grows one row per observation per field. POSSIBLE rows are stored and
  never shown, so the table is larger than what the UI implies; pruning is a later
  decision, not a v1 one.

**Explicitly out of scope**
Third-party enrichment vendors, image/portrait fetching, autonomous agents that
choose their own goals (ADR-016's "NO" stands unamended for those — Phase 5 of the
upgrade plan requires its own ADR), and any change to ADR-015's chat loop.

_Related: ADR-015 (stop-at-write chat), ADR-016 (guardrails #2 and #4), ADR-009
(mail/calendar ingest), ADR-005 (audit log, append-only), ADR-001 (RLS),
ADR-017 (the registry the fact tools are defined in)._
