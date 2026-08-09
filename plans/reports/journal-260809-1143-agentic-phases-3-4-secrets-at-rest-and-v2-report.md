# Journal — Phases 3 and 4, secrets at rest, and cutting 2.0.0

**Date:** 2026-08-09 · **Branch:** `main` · **Commits:** `e141028`…`30ab2e8` (15)
**Plan:** [`260808-2159-agentic-crm-upgrade`](../260808-2159-agentic-crm-upgrade/plan.md)
**Released:** [`v2.0.0`](https://github.com/olbboy/fourty/releases/tag/v2.0.0)

## What this was

Started as "cook phase 3" and did not stay there. Phase 3 (keyless research),
Phase 4 (per-record agent panel), then a security gate that had been red long
before any of it, a re-audit of `CLAIMS.md` that turned up a real hole, closing
that hole, and a 2.0.0 release.

Phases 0–2 were already committed but unpushed when this began, so the first
push carried 18 commits' worth of work that nobody had put in front of CI yet.
That is worth noticing on its own: three phases had been "done" for a while
without a single remote build.

## The thing that went best

**Two rounds of review, four real findings, none of them cosmetic.**

Phase 3's reviewer found that the signature extractor read the last paragraph of
any message and attributed it to the sender. Paste a colleague's contact card at
the end of a mail — *"see below for reference: Jane Doe, VP of Sales,
jane@customer.example"* — and Jane's title landed on the *sender's* record. With
one corroborating source it would have auto-applied. That is precisely the
failure the phase plan names as the worst available outcome, written into the
fixtures as a rule ("a miss costs nothing, a wrong answer lands on a customer
record"), and I built it anyway.

The fix is a `belongsToSender` check: the block must carry the sender's own
address, follow the RFC 3676 delimiter, or name them. Four fixtures pin it.

Phase 4's reviewer found that a stream outlives the thread it belongs to.
`/contacts/[id]` re-renders the panel rather than remounting it, so switching
record mid-answer left the old SSE loop writing into the new panel — one
contact's answer arriving on another contact's record. Every run now carries a
generation token.

Both were things I would not have found by re-reading my own code, because in
both cases I had written a comment explaining why the design was safe.

## The mistake worth writing down

**A red test can mean the design is wrong, and telling that apart from a stale
assertion is the whole skill.**

This came up three times in one session, and I got it right twice and nearly
wrong once.

When encryption at rest went in, three tests went red. The reflex is to look at
what the tests assert and update them. Reading them instead showed the design
was wrong: I had made *every* credential write fail closed with no key, and an
OAuth access token refreshes roughly hourly. Every mailbox connected before the
upgrade would have stopped syncing about an hour after deploy. That is the
option the user had explicitly rejected, arrived at by a side door — "fail closed
entirely", just delayed enough to look like something else.

The rule became: refuse a *new* credential, but let one that is replacing
plaintext keep writing plaintext, with a warning. The plaintext is already in
that row; refusing to rewrite it protects nobody and takes the mailbox offline.

Twice more the opposite was true. Sealing the ICS URL turned four tests red, and
there the assertions genuinely were the old contract — they asserted the URL
stays readable, and the whole point was that it must not. Those got rewritten,
not deleted, because an assertion that says the opposite of what it used to say
is the clearest record that a contract changed.

## What was harder than expected

**Writing a ground-truth audit is a good way to publish a fabricated finding.**

`CLAIMS.md` had gone a month stale — still describing SQLite, 55 tests, and
listing multi-tenancy, RBAC, MCP, SSO and 2FA as MISSING. Re-auditing meant
tracing every README claim to code, and I counted rather than quoted: 26 MCP
tools (the README says 26), 12 currencies, 5 workflow actions, 27 RLS policies.

Then I grepped the frozen GraphQL SDL for `type Mutation`, read the first twenty
lines of the fixture, saw only `type Query`, and concluded GraphQL was
read-only. It is not — there are eleven mutations, starting at line 128. I
caught it a step later while checking something else.

Had that shipped, a document whose entire purpose is "checked against the actual
code, not against comments or prose" would have carried an invented PARTIAL. The
narrower true finding — no deal, task or note mutations — was still worth
recording, and matches the two honest skips already in `surface-parity`.

**A documented blocker can be wrong, and being written down makes it look
settled.** ADR-019 recorded that sealing the ICS feed URL was blocked because
Settings displays it. When I finally looked, Settings used it only as a label,
and `redactAccount`'s own comment claimed to surface "the ICS URL host" while
actually returning the entire URL. The stated intent had been right all along;
only the code disagreed. The blocker had been real for about as long as it took
to read one function.

## What the audit found that nobody had claimed

Mailbox OAuth refresh tokens were plaintext JSON in `sync_accounts.config`.
`SECURITY.md` was accurate about sessions and API keys and silent about this,
which is how it stayed invisible: nothing said the wrong thing, so nothing looked
wrong. Database read access was mailbox access — a backup on a laptop, a read
replica, a snapshot handed to a contractor.

Closing it took three commits (encryption, rotation, then the ICS URL) and the
interesting decisions were all about *not overselling it*:

- The key lives in the environment, never in `settings`. A key generated into
  the same table as the ciphertext protects against nothing and would make the
  module a decoration that reads as a security feature. The price — lose the key,
  reconnect every mailbox — is stated in the ADR rather than discovered.
- The threat model is written narrowly. A dump no longer yields credentials; an
  attacker with the running process still has the key and can just ask the app
  to sync. Claiming more would have been easy and wrong.
- The envelope carries no key id. GCM authenticates, so trial decryption over
  two or three keys is unambiguous, and rotation needs no format version and no
  migration of existing values.

## Decisions made mid-flight

**`profile.email-match` is never emitted by the research pass.** The pass selects
a contact's messages *by* their address, so scoring "this came from their
address" at 0.95 would be the pass confirming its own query — and would let a
single email auto-apply a job title, contradicting the plan's own "a lone
signature is PROBABLE". One message contributes exactly one observation.

**Five composer states, not the four the plan specified.** Fourty's agent stops
at every write, and the send route answers 409 until a proposal is resolved. That
is a real state. Folding `confirming` into `working` would tell the user to wait
for something that is waiting for them — the exact class of lie the other four
states exist to prevent.

**The Agent tab does not repeat "Background work".** The phase asked it to. That
panel is already on screen the whole time in the left column, and duplicating it
inside the tab is the opposite of the "compose, don't replace" constraint.

**Next 16 was not optional.** CI's `security-audit` job had been failing since
before this work started, on eight advisories that all traced to one root: next
15 is itself in the vulnerable range and pulls vulnerable `postcss` and `sharp`.
The advisory range ends at `16.3.0-preview.10`, so no patch inside `^15` closes
it. A framework major bump verified against the full gate rather than assumed —
and a note that `next.config.ts` uses only options Next 16 still has, so the
switch to Turbopack needed no change.

## What the release exposed

`[Unreleased]` had nine entries and **not one of them was from this cycle**. No
research, no agent panel, no encryption, no Next 16. Tagging that would have
published a record of a release that had already moved on without it.

Five `Added` entries and four `Changed` entries later, three of them breaking,
2.0.0 was the only honest number: the file says it follows semver, and shipping
three breaking changes as 1.x would make anyone pinning `^1.0.0` receive them
silently.

## Open threads

1. **GraphQL write parity.** No deal, task or note mutations; no MCP tool
   completes a task. These are the two declared skips in `surface-parity` and
   they are honest skips, but they have now survived two audits.
2. **`npm run lint` is still broken** — no ESLint config, and `next lint` is
   deprecated in Next 16. Typechecking via `npm run build` is what actually
   gates. Pre-existing, and now slightly more awkward to keep ignoring.
3. **Field-permission redaction in the AI grounding block.** `loadRecordContext`
   gates on object-level read and does not run `redact()` over the fields it
   puts in the prompt. A role that cannot see a field could hear it in an answer.
   Recorded in the Phase 4 file; the fix is one call.
4. **Phase 5 is gated, not deferred.** ADR-016 still reads NO for in-app
   autonomous agents and for an apps platform, which is exactly what Phase 5 is.
   Starting it is an ADR decision, not a coding one, and an amendment reached as
   a side effect of a code change is the accident that rule exists to prevent.
5. **Nothing here has met real mail.** Every claim about signature precision is
   backed by fixtures I wrote. The false-positive rate on actual mailboxes is
   unknown, and the fixtures are only as good as the failure modes I thought of —
   which the Phase 3 review already demonstrated is not all of them.
