# Review: Phase 4 — per-record agent panel (uncommitted work)

Scope: uncommitted diff on `main` at /Users/leo/Workspace/Personal/fourty, against
plans/260808-2159-agentic-crm-upgrade/phase-04-per-record-agent-panel.md. Advisory
only, no files changed. `npx tsc --noEmit` re-verified clean.

## Summary

The security-critical half of this phase — server-side record verification and
owner-scoped threads — is implemented correctly and is covered by a real-Postgres
test (`tests/ai-conversations.test.ts`) that specifically distinguishes RLS from the
`user_id` predicate, which is the right test to write. `composer-state.ts` is exhaustively
tested and matches the failure list's ready/working/confirming/ended/offline table
exactly.

The problems are in `agent-panel/index.tsx`: the panel supports switching between
multiple threads and multiple records while a single set of React state variables
(`items`, `streamingText`, `turn`) is shared across whatever the user has switched to,
and the SSE consumer loop has no way to tell "I am stale, stop touching this state" once
that happens. There's also one real authorization inconsistency between the two new
routes, and one confirmed doubling of `/api/facts` traffic on every record page view.

## Critical

None found.

## High

### H1 — Switching threads or records mid-stream lets the abandoned stream write into the newly opened view

`consume()` (agent-panel/index.tsx:189-238) is a `useCallback` with an empty dependency
array. It updates `items`/`streamingText`/`turn` via plain `setState` calls with no check
that the thread or record it was started for is still the one on screen. Nothing in
`openThread()` (line 174) or the record-reset effect (line 106) cancels the fetch reader
or the async generator that's consuming it — they only reset local state, which the still-running
`consume()` loop then continues to write on top of.

Concrete scenario:
1. Rep opens contact A's Agent tab, asks a question. `turn` → `streaming`.
2. Before the answer finishes, the rep picks a different thread from the `ThreadBar`
   dropdown, or clicks into contact B (page.tsx has no `key={id}`, so `ContactDetail`
   does not remount — confirmed by reading `src/app/(app)/contacts/[id]/page.tsx`,
   and the panel's own reset effect at index.tsx:106 exists precisely because the
   component persists across record navigation).
3. `openThread`/the record-reset effect clears `items`, `streamingText`, `turn`,
   and `loaded.current`, and (for a record change) the transcript-fetch effect starts
   loading the new thread/record's real messages.
4. Contact A's stream is still running server-side. Its `delta` events keep calling
   `setStreamingText`, its `tool_result`/`done` events keep calling `setItems`/`setTurn`
   — now against contact B's (or the new thread's) view. The `done` handler appends
   contact A's assistant reply onto whatever `items` array is current, which by then may
   be contact B's freshly-loaded transcript.
5. Net effect: contact A's answer (which can contain contact A's private facts/deal
   data) visually appears appended to contact B's conversation, with no visible question
   preceding it, or interleaves with contact B's real transcript depending on timing.

This is exactly the class of race the review was asked to check for ("races between the
thread-list fetch, the transcript fetch and the live SSE stream"), and it is new in this
phase — the global chat drawer (`ai-chat.tsx`) has no multi-thread/multi-record concept
so this shape of bug cannot occur there.

Fix: give `consume()` an owner token (e.g. a ref holding `{entityId, threadId}` captured
at request time, or a monotonically incrementing generation counter bumped by
`openThread()` and the record-reset effect) and check it before every `setState` inside
the event loop; bail out silently on mismatch. The same token also gives you a cheap way
to `return`/stop iterating early instead of just discarding the result.

Not covered by any existing test: the e2e suite runs with no AI provider configured
(everything is `offline`/disabled), so `consume()` never actually executes there, and the
unit tests only exercise the pure modules.

### H2 — `AgentPanel` fetches `/api/facts` unconditionally on mount, doubling the endpoint's traffic on every record page view

`AgentPanel` calls `useFacts(entityType, entityId, refreshKey)` at the top of its
function body (index.tsx:103), unconditionally — not gated on `opened`/`hidden`. Since
`RecordTabs` always renders `<AgentPanel .../>` in the DOM (just `hidden`, never
conditionally mounted — that's the whole point of rule 3), this fires on every single
visit to a contact/company/deal detail page, whether or not the rep ever opens the Agent
tab.

`useFacts` has no cache/dedup (`fact-suggestion.tsx:40-64` — plain `useEffect` + `fetch`,
two requests per call: `status=PROPOSED` and `status=APPLIED`). Both `contact-detail.tsx`
and `company-detail.tsx` already call `useFacts(entityType, id, refreshKey)` at their own
top level to feed `FactsForField` chips under form fields (confirmed:
`contact-detail.tsx:28`, `company-detail.tsx:28`). So for every contact and company page
view, this diff adds a second, fully redundant pair of `/api/facts` requests. For deals
— which have no `FactsForField`/`useFacts` call at all today — it adds two requests to an
endpoint that structurally can't return anything useful for that entity type (`facts`
are scoped to contact/company; `ResearchFindings`'s own empty-state copy even says
"Connect a mailbox…" for a type that was never wired to have facts).

This directly contradicts the stated invariant in `record-tabs.tsx`'s own doc comment:
"The agent pane still does no work until the tab is opened once." It doesn't currently —
it does this work on mount, i.e. on every page load.

Fix: gate the `useFacts` call (or the whole `ResearchFindings` subtree) on `opened`, or
better, lift the facts already fetched by the parent detail page and pass them down as
props instead of re-fetching — the parent already has `proposed`/`appliedFacts` in scope
at `contact-detail.tsx:28` / `company-detail.tsx:28`.

## Medium

### M1 — `GET /api/ai/conversations/[id]` skips the role-permission check its sibling LIST route enforces

`GET /api/ai/conversations` (list) calls `authorize(auth, permissionObjectFor(entityType), "read")`
before returning anything (`route.ts:27-28`). `GET /api/ai/conversations/[id]` (read) does
not call `authorize`/`can` at all — it only checks `userId` ownership via
`getConversation` (`[id]/route.ts:19-24`).

Both checks are coarse (role-level, not row-level — consistent with the rest of the
app's permission model, this isn't introducing a new class of gap), but the
inconsistency means: a rep whose role is later downgraded below `{contacts|companies|
deals}:read` can still retrieve the full transcript — including the record-grounding
facts the assistant printed into its answers — of any conversation they previously
created about that record type, via `GET /api/ai/conversations/[id]`, while the LIST
route for the same record would correctly 403 them. This is a narrow window (requires a
role downgrade after the conversation exists) but it's a real, verifiable inconsistency
between two routes shipped in the same diff, not a hypothetical.

Fix: add the same `authorize(auth, permissionObjectFor(conv.entityType), "read")` check
in the `[id]` route when `conv.entityType` is set (skip it for unbound/global-chat
conversations, which have no entity to check against).

### M2 — Composer allows a second `send()` while the first request is still in flight

`state` stays `"ready"` (so `canSend(state)` is `true`) for the entire window between
clicking Send and the fetch's response headers arriving — `turn` is only set to
`{kind:"streaming"}` inside `consume()`, which only runs after `await fetch(...)`
resolves (index.tsx:189-194, `send()` at 240-257). `send()` does clear `input` immediately,
which disables the submit button via `!value.trim()`, but a rep who types a second
message and hits Enter during that window (typical on a slow network / cold Lambda /
first grounding query) fires a second `POST /api/ai/chat` with the same
`conversationId: threadRef.current` (`null` for a brand-new thread). Two concurrent
`kind:"message"` requests with `conversationId: null` each independently call
`createConversationWithFirstMessage`, producing two separate conversation rows from one
user action, and both `consume()` calls then race to write into the same `items`/
`streamingText` state, interleaving two providers' streamed text into one view.

This is not a data-integrity or security bug (each conversation is written correctly and
consistently server-side), but it is a real, reachable UX/data bug distinct from the
pre-existing global-chat drawer's version of the same gap (`ai-chat.tsx` has the
identical pattern, but has no multi-thread concept, so a double-send there just adds two
turns to the one thread rather than spawning a duplicate conversation).

Fix: set `turn` to a "sending" phase synchronously in `send()`/`decide()` before the
`fetch` call, not only inside `consume()` after it resolves.

## Low

- `record-context.ts`'s per-record grounding queries (2-3 selects per turn: the record
  itself + neighbour ids) are bounded and fine; not a real N+1 concern, noting only
  because it was in scope to check.
- `ai_conversations_record_idx` column order (`workspace_id, entity_type, entity_id,
  user_id, updated_at`) matches `listConversationsFor`'s filter + sort exactly; migration
  0016 and its down-migration are correct and reversible.
- The `toItems` extraction into `agent-panel/transcript.ts` and reuse from `ai-chat.tsx`
  is a clean dedup with no behavioral change — confirmed by diff, no regression to the
  global chat drawer.

## Verified as correct (worth recording, not just silence)

- **Record spoofing (focus a):** a client-supplied `entityType`/`entityId` on a *new*
  thread is only ever used as a lookup key — `loadRecordContext` re-checks `can(role,
  object, "read")` and the row's existence under the caller's own `withWorkspace()`
  before anything is put in the prompt; a forbidden and a missing record both come back
  404 (`chat/route.ts:99-119`, test at `ai-conversations.test.ts:153-163`). For an
  *existing* conversation, the binding is read from the owned row on the server
  (`owned.entityType`/`owned.entityId`) and any `entityType`/`entityId` in the request
  body is silently ignored — a caller cannot rebind an existing thread to a different
  record by resending the create-style fields.
- **Owner scope vs RLS (focus a):** `listConversationsFor` and `ownedConversation` both
  filter on `userId` in addition to whatever RLS already scoped to the workspace, and
  `tests/ai-conversations.test.ts` specifically tests two admins (not two different
  roles/workspaces) in one workspace to prove the `user_id` predicate — not RLS — is what
  keeps them apart. This is the right test for the right claim.
- **ADR-015 (focus d):** the new grounding read (`grounding()` + `loadRecordContext()`)
  is inside the same single `withWorkspace()` transaction as before, closed before
  `runAgent`/`streamChat` is called; the per-step loop in `agent.ts` still opens one
  `withWorkspace()` per DB touch around the provider call, unchanged.
- **Migration 0016 (focus e):** additive nullable columns + one composite index on an
  already-RLS-covered table; down migration drops both cleanly.
- **Global chat regression (focus f):** none found; `ai-chat.tsx`'s only change is
  importing `toItems`/`Item`/`StoredMessage` instead of defining local duplicates.

## Recommended actions, in order

1. H1 — add a generation/owner token to `consume()` so a stale stream can't write into
   whatever thread/record the panel has since switched to. This is the one that can put
   one record's data in front of the wrong record on screen.
2. H2 — gate `useFacts` in `AgentPanel` behind `opened`, or accept the parent's already-
   fetched facts as props instead of re-fetching. This doubles a hot endpoint's traffic
   site-wide today, not just for Agent-tab users.
3. M1 — add the missing `authorize()` check to `GET /api/ai/conversations/[id]` for
   record-bound conversations.
4. M2 — set a "sending" phase synchronously before the fetch in `send()`/`decide()`.

## Unresolved questions

- Is a role downgrade after a conversation exists (M1's scenario) an accepted risk given
  the rest of the app's role model, or does it need fixing before ship? I could not find
  an existing ADR that speaks to whether persisted AI transcripts should re-check current
  role on read.
- Is `ResearchFindings` intended to render for `entityType === "deal"` at all? Today it
  renders (with an always-empty "Nothing found" state) for deals, which have no facts
  pipeline — worth confirming this is intentional inert UI vs. dead surface to remove.

---
Status: DONE_WITH_CONCERNS
Summary: Server-side record verification and owner-scoped threads are correctly implemented and well-tested; the panel's client-side state handling has a real cross-thread/cross-record stream-bleed race (H1) and an unconditional duplicate /api/facts fetch (H2), plus a minor authz inconsistency between the two conversation routes (M1) and a double-send race (M2).
Concerns/Blockers: H1 and H2 are concrete, reproducible, and worth fixing before this ships; H1 in particular can show one record's private data in the panel for a different record the rep is now looking at.
