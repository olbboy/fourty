---
phase: 4
title: "Chat Drawer UI"
status: done
priority: P2
dependencies: [3]
effort: "M"
---

# Phase 4: Chat Drawer UI

## Overview

A global chat drawer in the app shell that consumes the Phase 3 SSE contract: streams assistant
text, renders read-tool results, and shows confirm/cancel cards for proposed writes. Reuses existing
UI primitives; no component library, no new deps.

## Requirements

- Functional: toggle drawer (near ⌘K); send message; render streaming assistant text; render `tool_result` compactly; render `tool_proposal` as a confirm/cancel card (per proposal + "confirm all"); on confirm/reject POST the decision and continue the stream; restore the active thread on mount.
- Non-functional: hidden entirely when AI disabled; client SSE via `fetch` + `ReadableStream` (no `EventSource`); accessible (focus management, labels), matches existing Tailwind style; VI/EN via existing i18n.

## Architecture

- **SSE reader** (pure, testable): `parseSseStream(reader)` → async iterator of events, splitting on `\n\n`, stripping `data: `, `JSON.parse`. Extract as a standalone function so it can be unit-tested without a browser.
- `src/components/ai-chat.tsx`:
  - State: `messages[]`, `streamingText`, `pendingProposals[]`, `conversationId`, `status` (`idle|streaming|awaiting_confirmation`).
  - Send: `POST /api/ai/chat` with `{ conversationId, message }`; read the stream; on `delta` append to `streamingText`; on `tool_result` push a compact row; on `tool_proposal` push a card; on `awaiting_confirmation` set status; on `done` finalize the assistant message.
  - Confirm/reject: `POST /api/ai/chat` with `{ conversationId, decision: { messageId, approve } }`; consume the resumed stream identically.
  - On mount: fetch the active conversation's messages (a small `GET` — add `GET /api/ai/chat?conversationId=`; **owner-scoped by `userId`, returns 403/empty for another user's thread — RT-C**) to restore history. The GET MUST include each message's `status`.
  - **Restore live pending card (RT-F):** any message with `status: 'pending_confirmation'` MUST render as an actionable confirm/reject card on mount — not inert history text. This covers the case where the browser dropped after the write was persisted but before the `tool_proposal` SSE byte arrived; without it the thread is permanently wedged (a new message returns `409`).
- **Availability gate**: server passes an `aiEnabled` flag (e.g. via a small `GET /api/ai/status` or an existing bootstrap prop) → the toggle button renders only when enabled.
- Mount in `src/components/shell.tsx` alongside the command palette; reuse buttons/inputs/dialog semantics from `src/components/ui.tsx`.

## Related Code Files

- Create: `src/components/ai-chat.tsx`
- Create: `src/lib/ai/sse-client.ts` (`parseSseStream` — pure, unit-tested)
- Modify: `src/components/shell.tsx` — mount drawer + toggle + `aiEnabled` gate
- Modify (small, if needed): `src/app/api/ai/chat/route.ts` — add a minimal history `GET` + `GET /api/ai/status`
- Create (tests): `tests/ai-sse-client.test.ts`
- Reference: `src/components/command-palette.tsx` (drawer/overlay + keyboard pattern), `src/components/ui.tsx`, `src/lib/i18n/*`

## Implementation Steps (TDD where it pays)

1. **RED — `tests/ai-sse-client.test.ts`**: `parseSseStream` over a `ReadableStream` of chunked bytes (events split across chunk boundaries; multiple events per chunk; trailing partial line) yields correctly ordered, fully-parsed events; ignores blank lines.
2. **GREEN** — implement `sse-client.ts`.
3. Build `ai-chat.tsx` consuming `parseSseStream`; wire send + decision flows; render text/tool_result/proposal states.
4. Add the `aiEnabled` gate + history restore; mount in `shell.tsx`.
5. **Manual verification** (documented checklist — UI has no component-test harness in this repo): VI prompt + EN prompt; a read query; a create-with-confirm (row appears only after confirm); a rejected write; **reload mid-`pending_confirmation` restores a live confirm card (RT-F)**; AI-disabled build hides the toggle.

## Success Criteria

- [ ] `tests/ai-sse-client.test.ts` green (chunk-boundary + multi-event cases).
- [ ] Drawer streams text, shows confirm cards, executes only on confirm, restores thread on reload — including a live confirm card for a `pending_confirmation` message (RT-F); history GET is owner-scoped (RT-C).
- [ ] Toggle hidden when AI disabled; keyboard-accessible; no new npm dep.
- [ ] `npm run build` green; existing pages unaffected.

## Risk Assessment

- **R2:** SSE-over-POST chunk framing — bytes split mid-event. Mitigation: buffer until `\n\n`; the pure parser test covers boundaries.
- UI scope creep: keep to a single active thread + inline cards; no history list, no markdown renderer beyond plain text (out of scope round 1).
