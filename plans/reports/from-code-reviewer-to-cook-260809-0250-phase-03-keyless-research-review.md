# Phase 3 (keyless half) — production-readiness review

Scope: uncommitted diff on `main`, plans/260808-2159-agentic-crm-upgrade/phase-03-keyless-research-pass.md.
Verified by reading code + running: `npx tsc --noEmit` (clean), targeted vitest runs against Postgres
5433 (`tests/sync.test.ts`, `tests/facts-write-path.test.ts`, `tests/research-*.test.ts` — all pass), plus
two throwaway probe test files (written, run, deleted — no repo files left behind) to confirm two specific
behavioral claims below.

## Critical

### 1. Signature extractor misattributes a third party's title/employer to the sender
`src/lib/research/signature.ts` extracts a "signature" from the last paragraph of a message whenever that
paragraph is 2–8 lines and carries a phone/domain/email token (`hasContactMarker`). It never checks that
the block is *about* the sender — it has no notion of the sender's own name. Any closing paragraph that
mentions a third party's title next to an email address, phone, or domain gets attributed to whoever sent
the message.

Repro (ran via `extractSignature`, output shown):
```
body: "Sure, see below for reference.\n\nJane Doe\nVP of Sales, Acme Inc\njane@acme.example"
→ { title: "VP of Sales", employer: "acme.example", ... }
```
and a hard-wrapped closing line (very common in plain-text mail — most MUAs still hard-wrap at ~72-78
cols with real `\n`s):
```
"Hi team,\n\nPlease loop in Jane Doe, our VP of\nSales, at jane@customer.com for\nquestions on pricing."
→ { title: "our VP of", employer: "customer.com", ... }
```
Both are picked up as the *sender's* signature. `mail-pass.ts` then attributes `signatureTitle`/
`signatureEmployer` from `messagesFrom(contact.email, ...)` (messages the contact themself sent) straight
to that contact — there is no secondary check that the name in the block matches the contact. Combined
with one corroborating source (a thread reply or a meeting — trivially present on any active thread) this
reaches VERIFIED and auto-**applies** to `job_title`/`company_id`. This is exactly the failure mode
phase-03 names as the worst outcome ("a wrong title lands on a customer record, where nobody can tell it
is wrong") and the fixture suite (`tests/research-signature.test.ts`) has no case for "closing paragraph
names/quotes someone else's contact details" — every refusal fixture is about the sender's *own* prose,
not about prose that contains someone else's info.

Fix direction: require the block to look like the sender's own sign-off (e.g., the person's own name from
`msg.from`'s display name matching the first line, or requiring the delimiter form `-- ` for anything that
isn't extremely conservative), not just "trailing paragraph + any contact marker."

### 2. Kill switch (`research.keyless` = off) does not stop signature extraction/storage — contradicts SECURITY.md and the UI copy this diff ships
`src/lib/sync/ingest.ts:60` calls `extractSignature(msg.body)` and writes `signature_title/employer/
phone/raw` to `email_messages` **unconditionally**, for every synced message, on every ingest. The
`isKeylessResearchEnabled()` check (`bookEvidence()`, line ~150) only gates whether a `contact.evidence`
task gets *booked* — it runs after the columns are already persisted.

But this diff's own `SECURITY.md` addition says: *"How to switch it off: ... Off stops the reading for
the whole workspace at once,"* and `diagnostics.tsx`'s new copy says: *"Turning it off stops the reading.
Facts already on your records stay..."* Both are false as shipped: a workspace that disables the switch
still has up to 500 chars of the customer's own quoted signature text (`signature_raw`) extracted and
written to the DB on every sync, it just never becomes a proposed/applied fact. For a workspace that flips
this off for a compliance/consent reason, this is silent continued reading and storage of message content
against a documented guarantee that is part of *this same diff*.

Fix direction: gate the `extractSignature` call (or at minimum the four `signature_*` column writes) on
`isKeylessResearchEnabled()` inside `ingestEmails`, not just the task booking.

## High

### 3. Transaction-split refactor (pull.ts/transport.ts/api.ts) has zero test coverage
This is the diff's highest-risk mechanical change per the review brief (item a) — three sequential
`withWorkspace()` transactions replacing one, a new `accessTokenFor`/`fetchMail` split, and a new
`withAuthOutsideTransaction` auth wrapper. `grep` confirms no test file imports `sync/pull` or
`sync/transport` at all (`tests/sync.test.ts` only tests `parseEmail`/`parseIcs`/`ingestEmails`/
`ingestCalendar` directly). I traced the logic by hand and it looks correct — every DB read/write is
inside a `withWorkspace()` call, RLS applies throughout, the refreshed token is persisted before the fetch
that could fail, `markFailed`/`markSynced` are workspace-scoped, `authorize()` in the run route is
role-only (no DB, safe to run outside the transaction), and `tests/api-auth.test.ts`'s static guard was
correctly updated to recognize `withAuthOutsideTransaction(` as an auth entry point — but a refactor this
close to RLS/auth boundaries shipping with no integration test (e.g., a mocked-provider test of
`pullAccount` covering the refresh-then-fetch-fails path, and confirming the refreshed token still landed)
is a gap given the diff's own stated rationale ("Phase 2 recorded [this] as debt and Phase 3 is what makes
the volume matter").

## Medium

### 4. `record-fact.ts` PROPOSED-reuse path: correct, but untested and worth pinning
`existing.find(f => f.status === "PROPOSED" && f.value === value)` reuse logic (idempotency for a
scheduled pass) is a real behavior change to the Phase 1 write path. I hand-traced it and it's correct,
including the case where a reused PROPOSED row gets promoted straight to APPLIED on a second run with
stronger evidence (verified empirically with a throwaway probe: first call proposes at PROBABLE, second
call with an added `crm.thread-reply` observation reuses the same row id and flips it to APPLIED with the
old value correctly captured as `previousValue`, one row total). None of that transition is covered by a
permanent test — `tests/research-mail-pass.test.ts`'s "yields one fact from two runs" only exercises the
stays-PROPOSED case (same evidence twice). Recommend adding a test for the promotion path since it's the
one place a bug would silently duplicate or corrupt a proposal history.

### 5. `agent_tasks` open-task race (pre-existing, worth flagging since Phase 3 now depends on it more)
`bookEvidence()` in `ingest.ts` calls the existing `openTask()`-then-`scheduleTask()` pair per touched
contact (bounded ≤50 per sync — fine, not an N+1 concern). But `openTask`/`scheduleTask` (Phase 2,
untouched here) is check-then-act with no unique constraint or `SELECT ... FOR UPDATE`, so two concurrent
transactions booking `contact.evidence` for the same contact (e.g. two mailboxes syncing the same contact
around the same time, or a scaled-out worker) can each observe "no open task" and both insert — a stacked
duplicate task, not a duplicate *fact* (record-fact.ts's own reuse logic in finding #4 covers that), but
still wasted work. Not a regression from this diff and the dispatcher drains tasks sequentially per
workspace today, so low likelihood — noting since Phase 3 is the first caller that books on every sync
rather than once at connect time.

## Low / informational

- `src/lib/research/identity.ts:90` builds a `LIKE '%' + email + '%'` clause with the raw address
  interpolated as a bound parameter (safe from SQL injection — Drizzle `sql` template binds it) but does
  not escape LIKE metacharacters (`%`, `_`) that could theoretically appear in a local-part. Harmless in
  practice: the row is confirmed by an exact-match check in `attendedBy()` afterward, so a widened LIKE can
  only produce false candidates that are then filtered out, never a false positive.
- Two files in the phase file's "Create" list are not part of this diff: `session-pass.ts`, `budget.ts`,
  and `tests/research-egress.test.ts` — expected and consistent with the task framing ("Phase 3 (keyless
  half only)"); flagging only so the model-backed-lane follow-up isn't mistaken for already covered.
- `parse-email.ts`'s `splitParts()` collects all boundary-delimited parts into memory before the caller
  slices to `MAX_PARTS = 20` — a message with pathologically many boundary lines does more allocation than
  necessary before being bounded. Not a crash risk, bounded by whatever upstream message-size limits
  already exist outside this diff; low priority.

## What's solid

- `withAuth`/`withAuthOutsideTransaction`/`pull.ts`/`transport.ts`: every DB read and write I traced is
  inside a `withWorkspace()` call; nothing runs outside RLS. The "Sync now" route still authorizes
  (`authorize(auth, "sync", "update")`) before calling `pullAccount`, and audits after, correctly
  workspace-scoped.
- `record-fact.ts`'s three invariants (never overwrite human, never re-offer dismissal, never VERIFIED
  without a primary source) are untouched by this diff and still enforced ahead of the new reuse logic.
- `identity.ts` is exact-address-only, confirmed by test and by reading — no fuzzy/name matching path
  exists anywhere in the reachable code.
- `body` (the decoded MIME text) is read only inside `ingestEmails`/`extractSignature`; grepped for any
  `.body` usage, logging, or persistence elsewhere — none found. The `email_messages` schema diff adds
  only the four bounded `signature_*` columns, no body column.
- `evidence.ts` (Phase 1, untouched) correctly keeps a lone `crm.signature-block` (weight 0.80) below the
  VERIFIED floor (0.85) even though it's a primary source — matches the phase doc's stated design.
- Typecheck clean; the four targeted test files I ran (31+27+9+15 = 82 tests) all pass against real
  Postgres/RLS.

## Recommended actions, in order

1. Fix #1 (signature misattribution) before shipping — it's the exact failure mode the phase doc calls the
   worst outcome, and the repro is a common plain-text-mail shape, not a contrived input.
2. Fix #2 (kill switch should stop extraction, not just booking) — either gate the extraction or correct
   the SECURITY.md/UI claims to match actual behavior; shipping false security documentation is worse than
   shipping no documentation.
3. Add an integration test for `pull.ts`'s transaction split (mock the provider, assert token persists
   before a fetch failure, assert `markFailed`/`markSynced` land in the right workspace) before relying on
   it further.
4. Add a permanent test for the PROPOSED→APPLIED reuse/promotion path in `record-fact.ts`.

## Unresolved questions

- Is the intended semantics of `research.keyless = off` "stop turning evidence into facts" (current code)
  or "stop reading mail content at all" (current docs)? Whichever it is, code and docs need to agree —
  this is a product decision, not something I should resolve unilaterally.

---
Status: DONE_WITH_CONCERNS
Summary: Two critical findings — signature extractor can attribute a third party's title/employer to the wrong contact from ordinary closing-paragraph prose, and the keyless-research kill switch doesn't stop the reading it's documented to stop. One high finding — the transaction-split refactor in pull.ts/transport.ts ships with no test coverage. record-fact.ts's new idempotency logic is correct (hand-verified + probe-tested) but untested in the repo.
Concerns/Blockers: Findings #1 and #2 should block ship; #1 is a data-correctness/trust issue (wrong facts on customer records), #2 is a documentation-vs-behavior mismatch on a privacy control this same diff introduces.
