# Journal — Settings admin UI for SSO and mailboxes

**Date:** 2026-08-01 · **Branch:** `main` · **Commits:** `cd0586f`…`01197ff`
**Plan:** [`260801-1415-settings-admin-ui-sso-mailbox`](../260801-1415-settings-admin-ui-sso-mailbox/plan.md)

## What this was

Backlog #11. Two features — OIDC single sign-on (Gate D4) and mailbox/calendar
sync (Gate C6) — had shipped complete: routes, RBAC, audit, tests, ADRs. Neither
had a single pixel of interface. Setting up SSO meant a `curl` with a client
secret on the command line. The work was not building a feature; it was making
two finished features reachable.

## The gap the work exposed

Scouting for the UI turned up something the backlog entry did not say: sync
accounts had `GET`/`POST` on the collection and three action routes under an id
(`connect`, `run`, `ingest`), but **no `PATCH` and no `DELETE`**. You could
connect a mailbox and never disconnect it. The UI could not have been honest
about that — a panel with no way to remove a row is worse than no panel.

So the shape changed: fill the lifecycle gap first, then build on top of it. That
was the right call but it is worth noticing that a UI task turned into an API
task because nobody had tried to *use* the feature end to end before.

## What went well

**The previous plan's scar tissue paid off.** ADR-017 had recorded, painfully,
that a security guard which recognises routes by the *shape of their source text*
went blind when routes changed shape — and that the dangerous one failed
*quietly*, still passing while classifying nothing. That note was written down as
a cost, and it made this work cheap: the plan carried a mandatory step to strip
`authorize()` from the new route and confirm `tests/api-auth.test.ts` went red
naming the file. It did. Two minutes to verify what would otherwise have been an
assumption.

That is the whole argument for writing down what a mistake cost.

**Applying the same distrust elsewhere found a real hole.** After verifying the
RBAC guard, the same question got asked of the new UI: what test would fail if
the mailbox panel crashed on render? Nothing. `tsc` catches types, not runtime.
And **no end-to-end spec visits `/settings`** — the smoke suite covers auth,
kanban, and the command palette. A crash in either new panel would have shipped
behind a fully green suite. Added a render smoke test, then broke `MailboxSection`
on purpose to confirm only that test went red.

A gate you have not watched fail is not a gate.

## What was harder than expected

**The OAuth connect button is a trap that no test can catch.** `GET
…/connect` answers with a 302 *and* sets an httpOnly cookie carrying the PKCE
state. Written as `onClick={() => fetch(...)}` it looks completely reasonable,
follows the redirect inside the page, and the cookie never reaches the browser —
so the callback rejects the sign-in as forged. It fails at the last step of a
multi-step flow, far from the cause.

There is no automated test for "this is an anchor and not a fetch". The only
defence is a comment at the call site explaining *why*, so the next person
tidying up client code does not helpfully convert it. That comment is doing real
load-bearing work, which is uncomfortable.

**The file grew past what one file should hold.** Two panels took
`settings-client.tsx` from 493 to 947 lines — two and a half times the next
largest component in the tree. The plan had pre-committed a threshold (~800
lines) and a criterion (panels share no state) precisely so this would be a
measurement rather than a taste argument at the end. Split into six files, as a
**separate commit after** the feature commit, following the rule the previous
plan established: behaviour changes and structure changes never ride together.

## What the review caught

Zero critical, zero high — the security-sensitive claims (redaction, RLS,
cascade safety, the anchor-not-fetch thing, empty-secret-keeps-secret) all
verified independently rather than taken on trust. Good.

But it caught something I had written into my own acceptance criteria and then
not done: pause, resume, enable, disable, and delete fired their request and
reloaded the list whichever way it went. A viewer clicking Pause would see the
row snap back with no explanation. The sibling actions in the *same files* handle
this correctly — so this was not a missing convention, it was inconsistency I
introduced and did not notice.

Worse, the SSO panel rendered its error only inside the edit dialog, so even once
the failure was captured there was nowhere for it to appear. Two related misses,
one root cause: the row buttons got less care than the forms.

## Decisions made mid-flight

**Deleting a mailbox drops its ingested mail.** No FK exists on `account_id`, so
nothing at the database level would clean up. Checked whether anything reads
`email_messages`/`calendar_events` back: nothing in `src/` does — they are a
write-only dedup ledger. Their dedup key includes the account id, so they are
dead weight the moment the account goes. Meanwhile the entries a user actually
*sees* live in `activities`, keyed to the contact, and are untouched. Cascading
was safe; leaving orphans was not.

Worth flagging: it took reading four files to be sure of that, and the honest
alternative — leave the rows — would have looked more conservative while being
worse.

**IMAP stays in the list, labelled receive-only.** `runMailSync` only handles
Google and Microsoft; the other branch demands `ics` with a feed URL. An IMAP
account cannot be pulled from. But it *can* receive pushed mail through
`/ingest`, so it is a real option — just not the one the dropdown would have
implied. Kept it, said what it does, hid the sync button. Offering a button that
returns a 400 would be a small lie repeated to every operator.

## Open threads

1. `GET /api/sync/accounts` still has no `authorize()` — any authenticated user
   can list mailboxes (addresses and hosts, no secrets). Left alone deliberately:
   tightening it is a breaking change to a published contract and deserves its
   own decision, not a drive-by.
2. Backlog #15 (encrypt secrets at rest) is untouched and now slightly more
   visible: the UI writes SSO client secrets that land in Postgres as plaintext.
   The UI does not make this worse, but it makes it easier to do more often.
3. ~~Neither new panel has end-to-end coverage.~~ **Closed 2026-08-08** —
   `e2e/settings.spec.ts` drives both panels against a live server: create, edit,
   toggle, and delete round trips for SSO, and add/pause/resume/disconnect for
   mailboxes.

   The claim above that the OAuth connect button had **no** automated defence
   turned out to be wrong, in the useful direction: an end-to-end test *can*
   assert the control resolves as a link, and `getByRole("link")` fails outright
   the moment it becomes a button. Verified by making exactly the "helpful
   tidy-up" edit the source comment warns about and watching that spec go red.

   Verifying the empty-secret path the same way turned up something the original
   write-up missed: the API rejects `clientSecret: ""` with a 400, because the
   update schema requires a minimum length. The defence was two layers deep the
   whole time, not one. The client-side omission is still the right behaviour —
   it is what makes the field mean "unchanged" rather than an error — but the
   risk of a silent broken login was lower than recorded.
