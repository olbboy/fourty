---
title: "In-App AI Agent / Chat — round-1 vertical slice"
description: "Conversational agent that reads CRM data and proposes writes (human-confirmed), reusing existing MCP tools + auth. BYO OpenAI-compatible LLM, hand-rolled SSE streaming, in-request stop-at-write loop."
status: completed
priority: P2
branch: "main"
tags: [ai, agent, chat, streaming, tdd]
blockedBy: []
blocks: []
created: "2026-07-08T18:07:43.736Z"
createdBy: "ck:plan"
source: skill
---

# In-App AI Agent / Chat — round-1 vertical slice

## Overview

In-app conversational agent (backlog #3 + #4). User chats in natural language (VI/EN); the
agent **reads** CRM data automatically and **proposes** writes that the user must confirm
before they execute. Approach **A** (approved in brainstorm): in-request agentic loop that
**stops at the first write**, streams tokens over **hand-rolled SSE**, and reuses the **existing
10 MCP tools** + the `withAuth` permission seam so the agent can never exceed the user's role.
LLM is **BYO OpenAI-compatible** (hand-rolled `fetch`, no SDK) and **optional** — unset key ⇒
UI hidden, `docker compose up` unchanged.

Brainstorm source: [`../reports/brainstorm-ai-agent-chat-260709-0055-in-app-conversational-agent-report.md`](../reports/brainstorm-ai-agent-chat-260709-0055-in-app-conversational-agent-report.md)

**Mode:** `--tdd` — every phase leads with failing tests, then implementation to green. Tests run
against **real Postgres + RLS** via `tests/pg-setup.ts` (`resetDb`, `createWorkspace`), mirroring
[`tests/mcp.test.ts`](../../tests/mcp.test.ts).

### Non-negotiable constraints (carried from brainstorm)

- **No new heavy npm deps.** Provider = `fetch`; client stream = `fetch` + `ReadableStream`; SSE by hand. Validate zero new runtime deps at each phase.
- **AI is optional.** `isAiEnabled()` gates route + UI. Unset `AI_API_KEY` ⇒ 404/hidden, existing 94 tests unaffected.
- **No privilege escalation.** Every tool call runs inside `withWorkspace()` with the user's `ctx {workspaceId, role, userId}`; tools already enforce `can()` + field-perms + RLS. Writes are always human-confirmed.
- **Reuse, don't fork.** `TOOLS` (add a `mutates` flag) is the single source of truth for MCP **and** the agent. Follow existing migration/RLS/text-JSON-column conventions.

### Out of scope (round 1 — do NOT build)

Per-record assistant · async/worker agent · workflow-trigger tool · `update_*`/`delete_*` tools ·
multi-conversation history UI (single active thread persisted; list view later) · encrypting `AI_API_KEY`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Provider & Tool Bridge](./phase-01-provider-tool-bridge.md) | Done |
| 2 | [Persistence & RLS](./phase-02-persistence-rls.md) | Done |
| 3 | [Agent Loop & Chat API](./phase-03-agent-loop-chat-api.md) | Done |
| 4 | [Chat Drawer UI](./phase-04-chat-drawer-ui.md) | Done |
| 5 | [Hardening & Docs](./phase-05-hardening-docs.md) | Done |

## Dependencies

- **Phase order is linear:** 2 depends on nothing external; 3 depends on 1 + 2; 4 depends on 3 (SSE event contract); 5 depends on 1-4.
- **External:** a reachable OpenAI-compatible endpoint for manual/e2e (OpenAI key **or** local Ollama `/v1`). Unit tests mock `fetch` — no live endpoint needed for CI.
- **Cross-plan:** none. B4/B5/B6 plans are DONE; no file overlap. Relates to backlog #3/#4 (doc-only).

## Acceptance criteria (whole plan)

- [x] User asks in VI or EN → agent replies streamed token-by-token in the user's language. *(locale from i18n cookie in `prompt.ts`; streaming via `ai-chat-api.test.ts`)*
- [x] Read intent → correct read tool(s) executed inline, answer grounded (no hallucinated records). *(`ai-agent.test.ts` read-turn)*
- [x] Write intent → `tool_proposal` confirm card; nothing writes until user confirms. *(`ai-agent.test.ts` stop-at-write)*
- [x] Confirm → write runs under the user's role (RBAC/RLS/field-perms identical to REST/MCP); reject → skipped, loop continues. Double-confirm/replay executes it **once** (RT-B); client-tampered args ignored, server-persisted args used (RT-D). *(`ai-agent.test.ts`: RBAC viewer-denied, double-confirm, args-integrity, reject)*
- [x] Every agent-executed write is in the immutable audit log **exactly once** with `via: 'ai'` — no `via:'mcp'` duplicate (RT-A). *(`ai-agent.test.ts` audit-scope assertion)*
- [x] `AI_API_KEY` unset → chat hidden / route disabled; `docker compose up` + existing tests unaffected. *(route 404 in `ai-chat-api.test.ts`; UI gated by `aiEnabled` prop; full suite 220/220 green)*
- [x] Conversation + messages persisted; reload restores the active thread **including a live confirm card for any pending write** (RT-F); cross-workspace **and** cross-user-in-same-workspace isolation proven by test (RT-C). *(`ai-store.test.ts` isolation; GET history restores pending as cards in `ai-chat.tsx`)*
- [x] Cost guardrails enforced: `max_tokens` set + per-user AI quota returns `429` when exceeded (RT-E); provider errors surface only as a sanitized generic message (RT-I). *(`ai-provider.test.ts` max_tokens; `ai-chat-api.test.ts` 429; `ai-hardening.test.ts` sanitized error)*

## Key architectural decisions (locked)

1. **Stop-at-write segmentation** — each HTTP request is one bounded loop (≤8 tool steps). Reads run inline; the first write ends the stream in `awaiting_confirmation`. Confirmation is a fresh request. No mid-stream resume state.
2. **Stream outside the DB transaction** — the chat route authenticates with the lower-level `authenticate()` (already exported, `src/lib/api.ts:47`) so an LLM stream does **not** hold a Postgres transaction open. `withWorkspace()` is opened only around each tool execution + message persist. Because this bypasses `withAuth`, the route must re-add `withContext` + `recordHttp` + access-log at stream close (RT-H) and map `userId = viaApiKey ? null : callerId` (`AuthOk` has no `userId`, RT-H/RT-A).
3. **Text-JSON columns** — `tool_calls` stored as `text` holding JSON (matches `contacts.custom` convention), parsed on read. No new column types.
4. **`mutates` flag on `Tool`** — explicit per-tool boolean drives the read-inline vs propose-and-stop branch. Avoids fragile name-matching.
5. **`via` on `ToolContext`** (added post-red-team) — reused write tools already `audit(... via:"mcp")` (`src/mcp/tools.ts:159,206,278`); the agent passes `via:"ai"` through ctx so the tool's own single audit row is correct. The route does **not** double-audit (RT-A).
6. **Confirmed writes are atomically claimed** — `claimPendingMessage` CAS (`... WHERE status='pending_confirmation'`) executes a proposal at most once; per-user ownership scoping on all conversation/message reads + decisions (RLS is workspace-only, workspace-mates share it) (RT-B, RT-C).

## Risks (top)

- **R1 (high):** streaming tool-call arg fragments (`delta.tool_calls[].function.arguments` by `index`) — dedicated unit tests in Phase 1.
- **R2 (med):** client SSE over POST (no `EventSource`) — `fetch` + `ReadableStream` line parser.
- **R3 (med):** provider variance (Ollama/LM Studio tool-calling) — document tested matrix; degrade gracefully when `tool_calls` absent.
- **R4 (med):** message round-trip into provider shapes (assistant-with-`tool_calls` then `tool` role with `tool_call_id`) — Phase 2/3 tests assert exact shape.
- **R5 (low):** Next.js streaming flush (headers, no buffering) — Phase 3 integration test asserts `text/event-stream` + incremental chunks.

## Red Team Review

### Session — 2026-07-09
**Reviewers:** 3 spawned (Security Adversary, Failure Mode Analyst, Assumption Destroyer). 2 completed with full evidence; the 3rd died on an API error mid-run and its key claims were re-verified manually by the controller (authenticate export/shape, audit context needs, `via` hardcode, migration-reversibility counts).
**Findings:** 11 after dedupe (all Accepted, all with `file:line` evidence — evidence filter passed).
**Severity breakdown:** 3 Critical, 3 High, 5 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| RT-A | Reused write tools audit `via:"mcp"`; Phase 3 double-audits → wrong + duplicate immutable rows | Critical | Accept | Phase 1, 3 |
| RT-B | No atomic CAS on `pending_confirmation` → double-confirm/replay writes twice | Critical | Accept | Phase 2, 3 |
| RT-C | RLS is workspace-only → workspace-mate reads others' threads (field-perm leak) + confirms their writes | Critical | Accept | Phase 2, 3, 4 |
| RT-D | Approve path had no server-side proposal accessor → risk of executing client-supplied args | High | Accept | Phase 2, 3 |
| RT-E | No `max_tokens` + CRUD-sized rate limit → any role drives unbounded LLM spend | High | Accept | Phase 1, 3 |
| RT-F | Pending-state machine hole: new msg while pending → malformed history/400/wedged thread; disconnect → orphan pending; partial multi-tool turn → dangling `tool_call` | High | Accept | Phase 2, 3, 4 |
| RT-G | Shared pool `max:10`, no `connectionTimeoutMillis`; parallel tool exec → app-wide hangs | Medium | Accept | Phase 3 |
| RT-H | Bypassing `withAuth` drops `request_id`/`recordHttp`/access-log on the abuse-prone route | Medium | Accept | Phase 3 |
| RT-I | Raw provider errors persisted/streamed → internal-infra leak (compounded by RT-C) | Medium | Accept | Phase 3, 5 |
| RT-J | `migration-reversibility.test.ts` hardcodes file arrays + counts → 0011 down ships untested, green | Medium | Accept | Phase 2 |
| RT-K | Conversation + first message in separate tx, FK-by-convention → orphan rows | Medium | Accept | Phase 2 |

**Rejected:** none — both completed reviewers were evidence-backed; the plan was written at design altitude, so most findings were "unspecified → make explicit" hardening, folded in without changing the approved architecture (Approach A, BYO provider, tool reuse, human-confirmed writes).

### Whole-Plan Consistency Sweep
Re-read `plan.md` + all 5 phase files after applying findings. Checks run:
- `FK-by-convention` now appears only in the RT-K findings row (describing the original problem); Phase 2 architecture uses a **real FK** — reconciled.
- No leftover instruction to fire a second `audit()`; the only match is the corrective "do NOT fire a second audit" (RT-A) — reconciled.
- `authenticate` "export if needed" language removed (confirmed already exported, `src/lib/api.ts:47`) — reconciled.
- `setMessageStatus` / `claimPendingMessage` / `getConversation(…, userId)` signatures consistent across Phase 2 ↔ 3 ↔ 4.
- DB `status` values (`pending_confirmation`/`executing`/`complete`/`rejected`) kept distinct from the SSE event name `awaiting_confirmation` — no collision.
- RT-A…RT-K tags trace to concrete edits in the phases named in the table.
**Result:** zero unresolved contradictions.

## Validation Log

### Session 1 — 2026-07-09
**Verification pass:** skipped per guard — `## Red Team Review` already carries codebase-verified evidence and the plan has no `[UNVERIFIED]` tags. Interview limited to genuine open decisions the red-team did not settle (the assumption-verification lens whose reviewer died mid-run).

**Questions asked:** 4. **Decisions confirmed:**

| # | Decision point | Choice | Propagated to |
|---|----------------|--------|---------------|
| V1 | Locale source for the stream route (route bypasses `withAuth`) | **Existing i18n cookie on `req`** (reuse `src/lib/i18n`), not client-body or LLM guess | Phase 3 (`prompt.ts`) |
| V2 | Agent testability | **Inject `streamChat` into the agent** as a dependency; tests pass a fake generator, no global-`fetch` stub at the agent layer (provider SSE tested separately in Phase 1) | Phase 1, Phase 3 |
| V3 | Local-model (Ollama/LM Studio) tool-calling | **Document tested matrix (OpenAI/Groq/OpenRouter) + degrade** to text-only when a model emits no `tool_calls`; no provider adapters in round 1 (YAGNI) | Phase 1, Phase 5 |
| V4 | Default AI quota (RT-E threshold — user's call) | **`AI_RATELIMIT_PER_HOUR` default `60` turns/user/hour**, admin-overridable | Phase 1 (`.env.example`), Phase 3, Phase 5 |

### Whole-Plan Consistency Sweep
Re-read `plan.md` + all 5 phase files after propagating V1–V4:
- Locale: Phase 3 `prompt.ts` now names the i18n cookie as the single source; no competing "client sends locale" or "LLM detects" text elsewhere.
- Provider injection: Phase 1 declares `streamChat` standalone/injectable; Phase 3 `agent.ts` consumes it via deps; Phase 3 test step already uses a "mock provider" — consistent.
- Provider matrix: Phase 1 (degrade) + Phase 5 (documented best-effort) agree; no claim elsewhere that Ollama tool-calling is fully supported.
- Quota `60/hr`: consistent across Phase 1 `.env.example`, Phase 3 architecture, Phase 5 docs.
- All V1–V4 edits carry `<!-- Updated: Validation Session 1 - … -->` markers.
**Result:** zero unresolved contradictions. Verification failures: 0 → plan eligible for implementation.

## Open Questions

- Conversation lifecycle: round-1 assumes a **single active thread per user** resumed on mount (a "new chat" affordance can start fresh). Confirm at cook time if a history list is wanted sooner.
- `AI_MAX_TOKENS` default `1024` is a starting guess — tune against the chosen model during Phase 5 manual verification.
