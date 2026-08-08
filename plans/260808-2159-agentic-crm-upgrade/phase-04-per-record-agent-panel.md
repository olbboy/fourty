# Phase 4 — Per-record agent panel + durable conversations

**Size:** M · **Depends on:** Phase 0 (content from 1 + 3) · **Closes:** backlog #3 (per-record assistant, multi-conversation history UI), #4 (streaming background ops)

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
