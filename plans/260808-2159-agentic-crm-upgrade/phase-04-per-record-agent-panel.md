# Phase 4 — Per-record agent panel + durable conversations

**Size:** M · **Depends on:** Phase 0 (content from 1 + 3) · **Status:** done (2026-08-09) · **Closes:** backlog #3 (per-record assistant, multi-conversation history UI), #4 (streaming background ops)

## Delivered

A **Timeline | Agent** tab on contact, company and deal detail.
`src/components/agent-panel/{composer-state,transcript,index,record-tabs}.tsx`,
`src/lib/ai/{record-context,principals}.ts`, `GET /api/ai/conversations` and
`/api/ai/conversations/[id]` (owner-scoped), migration `0016_conversation_record`
(+ down, reversible in CI), and `src/components/ai-enabled.tsx` so a client page
knows whether a provider exists without calling an admin-only route.
Tests: `tests/agent-panel-composer-state.test.ts` (12, pure),
`tests/agent-panel-transcript.test.ts` (10, pure), `tests/ai-conversations.test.ts`
(6, real PG), `e2e/agent-panel.spec.ts` (3). Full suite 573 passed, 17 e2e, build green.

### Deviations from this plan, all deliberate

- **Five composer states, not four.** Fourty's agent stops at every write
  (ADR-015) and the send route answers 409 until a proposal is resolved, so
  `confirming` is a real state here. Folding it into `working` would tell the
  user to wait for something that is waiting for *them* — the exact class of lie
  the other four states exist to prevent.
- **The Agent tab does not repeat "Background work".** Step 5 asks the tab to
  list this record's `agent_tasks`. That panel is already on screen the whole
  time, in the left column, and duplicating it inside the tab is the opposite of
  "compose, don't replace". The tab carries the half that has nowhere else to
  live: **what research found** — every proposal and every applied fact with its
  rationale — which is also what makes the tab worth opening with no provider
  configured.
- **`?thread=` is not cleared on a tab switch.** Changing record clears it by
  navigating. Clearing it on a tab switch would drop the open thread every time
  someone glanced at the timeline, which is the same complaint as failure #3
  from the other direction.
- **Grounding is a prompt block, not a tool call.** `record-context.ts` loads the
  record and its neighbour ids server-side, under the caller's own workspace and
  role, and renders one markdown block. A record the caller cannot read gets the
  same 404 as one that is not there.
- **`useFacts` gained an `enabled` flag.** The panel is mounted before it is
  looked at, and two callers on one page were asking `/api/facts` the same
  question twice on every record view.

### Fixed after review

- **A stream outlives the thread it belongs to.** `/contacts/[id]` re-renders
  this component rather than remounting it, so switching record or conversation
  mid-answer left the old SSE loop writing into the new panel — one contact's
  answer arriving on another contact's record. Every run now carries a
  generation token and a superseded run drains its response without writing.
- **A second Enter opened a second conversation.** The turn was claimed only
  once the response arrived, leaving a window where the composer still read
  `ready`. It is claimed before the request goes out.
- **The transcript route did not make the role check its sibling makes.**
  Ownership answers *is this yours*; it does not answer *may you still read that
  kind of record*.
- **The transcript fetch could land on top of a live answer** — found while
  building, before review: creating a thread mid-stream set `threadId`, which
  woke the read-it-back effect. A `loaded` ref keeps the stream's own thread from
  being fetched over the top of itself.

### Carried forward

- **The grounding block is object-scoped, not field-scoped.** `loadRecordContext`
  gates on `can(role, "contacts", "read")` and then renders a handful of the
  record's fields into the prompt. If a workspace has narrowed a *field* with
  `field_permissions`, that field is still hidden from the REST payloads and from
  the tools — but the prompt block does not run `redact()` over its own lines, so
  a role that cannot see a field could hear it in an answer. The fix is one call
  to `loadFieldPolicy` + `redact` in `record-context.ts`; it is left out of v1
  deliberately, and should be closed before field permissions are recommended for
  anything sensitive.
- The role check on the transcript route is defensive only: every current role
  (admin/member/viewer) may read CRM objects, so there is no role that fails it
  and therefore no test that proves it. It becomes real the first time a
  narrower role exists.
- No automated cover for the composer states in a browser — the pure machine is
  exhaustively tested and the e2e asserts the `offline` case, which is the one a
  fresh install sees.

## Why

Today Fourty has one global chat. The useful shape is a panel on the record you are looking at, which already knows which record that is, keeps its threads, and shows what the background pass did and why.

Comp AI shipped this and wrote down every way it broke. That list is free knowledge and this phase is mostly *not making those mistakes*.

## Requirements

- An **Agent** tab on contact, company and deal detail. The record travels in the request as a server-verified id — never appended to the user's message text.
- Conversations are durable and per-user. Two reps asking about the same contact are having two conversations.
- Which thread is open lives in the URL (`?thread=`), like every other view state, and is cleared when the record or tab changes.
- The composer has **four** states, kept apart: `ready`, `working`, `ended`, `offline`. Ended and working both disable input and mean completely different things — one is a wait of seconds, the other is permanent and offers *Start a new conversation*.
- The transcript is read back from persisted messages, so it survives a reload and an unavailable provider.

## Files

**Create**
- `src/components/agent-panel/index.tsx` — the panel.
- `src/components/agent-panel/composer-state.ts` — the pure state machine (`ready | working | ended | offline`).
- `src/components/agent-panel/transcript.ts` — snapshot → renderable messages; `resolveThread()`.
- `src/app/api/ai/conversations/route.ts`, `.../[id]/route.ts` — list/create/read, owner-scoped.
- `tests/agent-panel-composer-state.test.ts`, `e2e/agent-panel.spec.ts`.

**Modify**
- `src/lib/ai/store.ts` — conversations gain `entity_type`/`entity_id`; list-by-record, owner-scoped.
- `src/app/(app)/{contacts,companies,deals}/[id]/*-detail.tsx` — mount the tab.
- `src/app/api/ai/chat/route.ts` — accept a record binding and resolve it server-side; reject a client-supplied record the caller cannot read.

## The failure list to design against

Taken from Comp AI's write-up; each becomes a test or a comment:

1. **Nothing mounts until the thread list has loaded.** Rendering a thread while history is in flight starts a *second* conversation and remounts onto the real one — which presents as "history only appears if I refresh".
2. **The thread the panel landed on is captured once.** Re-deriving "the latest" as the list changes swaps the open conversation out from under a live answer the moment the first save adds a row.
3. **The panel is not unmounted when you switch tabs.** An inactive tab that is dropped aborts the stream mid-answer, and the reply lands in the store with nothing attached to receive it — "I went to another tab and the answer never came back". Keep it mounted; render nothing until opened once.
4. **A turn quiet for 90 seconds is over, not working.** A restarted worker leaves sessions with no closing boundary; treating them as in-flight locks the thread forever.
5. **An unreachable provider is `offline`, not `working`.** One is a fact about us, the other a claim about the session; stated as the latter it is both untrue and unrecoverable, because the read fails identically next time.
6. **One scroller row per message, not per tool call.** A row per call adds a layout boundary every few hundred milliseconds during an answer.
7. **Autoscroll follows the tail only while the reader is at the bottom**, and releases the moment they scroll away.

## Steps

1. `composer-state.ts` first — pure, fully tested, no React. Every other rule above is expressed through it.
2. Store: add the record binding + owner scope; list by record, newest first; a brand-new thread mounts with no conversation row and its first message creates one.
3. Panel: list → capture thread once → stream. Reuse the existing SSE client (`src/lib/ai/sse-client.ts`); do not hand-roll a second protocol.
4. Grounding: the panel's system prompt gets the record and its neighbour ids from Phase 0, plus the workspace block.
5. Background visibility: the same tab lists this record's `agent_tasks` (queued/why/when) and its fact proposals from Phase 1. Honest scoping of backlog #4: this is a task list + proposals refreshed on poll/revalidate — **not** token-level SSE for parsers, which have no tokens to stream. Only the chat itself streams.

## Validation

- `npm test -- composer-state` (pure, exhaustive over the transitions).
- E2E: open a contact → ask → answer streams → switch tab → return → answer still there; reload → transcript intact; provider down → panel says offline and stays usable.
- Two users, one contact, two conversations, no leakage (real PG test).

## Risks

- **Scope creep into a full chat product** — the panel answers about *this record*. Global chat stays as it is.
- **RLS + owner scope are different checks** — a workspace-mate must not read another rep's thread even though RLS lets the row through. Test both.
