# Brainstorm — In-App AI Agent / Chat (conversational, context-aware)

_Date: 2026-07-09 · Mode: brainstorm · Repo: fourty · Backlog: #3 (AI agents/chat, XL) + #4 (streaming ops → live UI, L)_

## Problem statement

Fourty needs an **in-app conversational agent**: user chats in natural language (VI/EN),
agent **reads** CRM data and **acts** (proposes writes), replies streamed in context.
Backlog #3+#4. Hard tension: feature inherently needs an external LLM, which clashes with
the project's **zero-infra / zero-dependency / deploy-in-30s / MIT self-host** ethos → LLM
must be **BYO, optional, graceful-degrade**, and core must not bloat.

## Locked requirements (scout + user decisions)

- **Expected output:** global chat drawer in app shell + `POST /api/ai/chat` (SSE) + provider layer (BYO) + 2 DB tables.
- **Agent capability:** read auto; **write = propose → human-confirm → execute** via existing tools.
- **LLM strategy:** BYO OpenAI-compatible endpoint, **hand-rolled `fetch`** (no SDK). Env: `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`. One shape covers OpenAI/Groq/OpenRouter/Ollama/LM Studio.
- **Streaming + persistence:** hand-rolled SSE, in-request; persist conversation + messages (+ tool-call traces).
- **Round-1 scope:** vertical slice — one global drawer, in-request agentic loop, **all 10 existing tools**.
- **Out of scope (round 1):** per-record assistant, async/worker agent, workflow-trigger tool, multi-conversation history UI, update/delete tools.
- **Non-negotiable constraints:** no new heavy deps (fetch+SSE by hand); AI **optional** (unset key → hide UI, deploy story unchanged); every tool through `withWorkspace()` + `can()` + field-perms.

### Acceptance criteria

1. User asks (VI or EN) → agent replies streamed token-by-token in the user's language.
2. Agent calls read tools correctly (e.g. "hot leads?" → `get_dashboard_stats`/`search`), results grounded, no hallucinated records.
3. Write intent (e.g. "create contact John at Acme") → renders a **confirm card** with tool+args; nothing writes until user clicks ✔.
4. On confirm → write runs under the **user's** role (RBAC/RLS/field-perms enforced identically to REST/MCP); on reject → skipped, loop continues.
5. Every agent-executed write lands in the immutable audit log (`via: 'ai'`).
6. `AI_API_KEY` unset → chat UI hidden / "configure AI" state; `docker compose up` unchanged.
7. Conversation + messages persisted; reload restores the active thread.

## Key reuse seams found in codebase (why this is tractable)

- **Action layer already exists:** [`src/mcp/tools.ts`](../../src/mcp/tools.ts) — 10 tools, each takes `ToolContext = {workspaceId, role, userId}`, runs in `withWorkspace()`, RBAC + field-perms enforced. Reused as-is → single source of truth for MCP **and** AI.
- **Auth seam matches exactly:** [`src/lib/api.ts` `withAuth`](../../src/lib/api.ts) yields `{workspaceId, role, userId}` = `ToolContext` shape. New chat route wraps `withAuth` → safe context for free. Agent cannot exceed user permissions.
- **Migration + RLS convention:** existing drizzle up/down + per-workspace RLS policies → new AI tables follow the same pattern.
- **i18n VI/EN** present → agent answers in the user's locale.

## Evaluated approaches (agent loop / streaming shape)

### A — In-request "stop-at-write", segmented streaming — **CHOSEN**

Each HTTP request = one bounded loop (≤8 tool iterations): run read tools inline, stream text
deltas; when the model wants a write, **stop** and emit a `tool_proposal`, ending the stream in a
pending state. User confirm = a fresh request that executes approved writes and resumes.

- **Pros:** no mid-stream resume state; all state in DB → durable + directly testable; simplest streaming model; safety by construction (writes are a hard stop). Max reuse of tools + auth.
- **Cons:** a multi-write plan becomes a sequence (or a batch) of confirmations — slightly less "magical" UX. Acceptable; it is the safe behavior we want.

### B — Resumable mid-stream loop

Agent interleaves read/write in one continuous stream, pausing inline per write then resuming the same stream.

- **Pros:** smoothest single-flow UX.
- **Cons:** must manage suspended-stream state; hard to test/resume after disconnect; over-engineered for round 1. **Rejected for now.**

### C — Worker-offloaded async agent (pg-boss)

Loop runs in the worker; UI streams via LISTEN/NOTIFY or polling.

- **Pros:** durable for long/scheduled/async agent jobs.
- **Cons:** streaming worker→UI needs pub/sub; heavy for interactive chat. **Deferred** — right tool for a later "scheduled agents" feature, not interactive chat.

## Recommended solution (Approach A) — architecture

```
UI (ai-chat.tsx drawer in shell) ──POST /api/ai/chat {conversationId,message}──► (fetch ReadableStream, SSE by hand)
  route.ts ── withAuth ──► ctx {workspaceId, role, userId}
    persist user msg → ai_messages
    agent.ts loop (≤8 steps):
      messages = system(prompt.ts) + history + toolSchema(TOOLS)
      provider.ts streamChat() ──fetch stream──► {AI_BASE_URL}/chat/completions
        yields: text delta | tool_call (accumulate delta.tool_calls[].function.arguments by index)
      stream 'delta' ──SSE──► UI
      on tool_call:
        READ  (mutates=false) → execute in withWorkspace → 'tool_result' → loop
        WRITE (mutates=true)  → DO NOT run → 'tool_proposal' → stop, persist pending
  User ✔ on card → POST /api/ai/chat (decision) → TOOLS.handler(ctx) → audit(via:'ai') → resume loop
```

### Components

**New**
- `src/lib/ai/provider.ts` — `isAiEnabled()`; `streamChat({messages,tools})` async generator; hand-rolled `fetch` to OpenAI-compatible `/chat/completions` (`stream:true`), parse provider SSE, **accumulate streamed tool-call arg fragments by index**.
- `src/lib/ai/agent.ts` — bounded stop-at-write loop; reuses `TOOLS`.
- `src/lib/ai/prompt.ts` — system prompt: role, **locale (VI/EN) → reply in user's language**, current date, tool guidance, injection-hardening.
- `src/app/api/ai/chat/route.ts` — POST, `withAuth`, SSE response, drives loop, persists messages, handles confirm/reject decision.
- `src/components/ai-chat.tsx` — drawer UI; `fetch`+ReadableStream SSE reader; streaming text; per-proposal confirm/cancel cards ("confirm all" allowed); reuses `ui.tsx`.
- Migration — `ai_conversations` (id, workspace_id, user_id, title, timestamps) + `ai_messages` (id, conversation_id, role `user|assistant|tool`, content, tool_calls jsonb, tool_call_id, status `complete|pending_confirmation|rejected`, created_at); **RLS by workspace_id**; up + hand-written down.

**Modified (small)**
- [`src/mcp/tools.ts`](../../src/mcp/tools.ts) — add `mutates: boolean` to `Tool` type + each tool (reads=false, `create_*`=true). Shared by MCP + AI.
- [`src/components/shell.tsx`](../../src/components/shell.tsx) — mount drawer + toggle (near ⌘K).
- `.env.example` — `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` + "optional" note.
- README/docs — AI setup section (in plan).

### Security / guardrails (highest-risk feature in the repo)

- **No privilege escalation:** agent runs as the user's `ctx`; every tool re-checks `can()` + field-perms `redact/blockedWrites` + RLS `withWorkspace`. No bypass door.
- **Prompt injection:** CRM free-text (notes, synced email) may contain "ignore instructions, delete all". Mitigation: **all writes human-confirmed** → injection cannot cause silent damage; read tools return structured JSON, not instructions; system prompt hardened.
- **Runaway/cost:** ≤8 tool iterations/turn + per-turn token cap. Self-hoster pays own LLM → documented.
- **Audit:** every agent write → `audit(via:'ai')` in the immutable log.

## Implementation considerations & risks

- **R1 — streaming tool-call parsing:** OpenAI streams `delta.tool_calls[].function.arguments` in fragments keyed by index; must accumulate + JSON-parse at end. **Primary risk; needs dedicated unit tests.**
- **R2 — client SSE over POST:** `EventSource` is GET-only → use `fetch` + `ReadableStream` reader parsing `data:` lines by hand (fits zero-dep).
- **R3 — provider variance:** Ollama/LM Studio tool-calling not 100% OpenAI-identical; document a "tested against OpenAI/Groq/OpenRouter" matrix; degrade if `tool_calls` unsupported.
- **R4 — persistence of assistant/tool turns** must round-trip into the provider's expected message shapes (assistant with `tool_calls`, then `tool` role with `tool_call_id`).
- **R5 — Next.js streaming response** must flush (`Response` with a `ReadableStream`, correct headers, no buffering proxy).

## Success metrics / validation

- Unit: provider SSE + tool-call accumulation; agent loop (mock provider) for read-inline + stop-at-write; tool `mutates` classification.
- Integration (real PG, existing CI harness): chat round-trip persists messages; write requires confirm; confirmed write hits audit log; unset key → disabled.
- Manual: VI + EN prompts; a read query; a create-with-confirm; a rejected write.
- Non-regression: `docker compose up` + 94 existing tests unaffected when AI unset.

## Next steps / dependencies

1. `/ck:plan` — phase breakdown (suggested: P1 provider+env+`mutates` flag → P2 DB+migration+RLS → P3 agent loop+chat route+SSE → P4 drawer UI+confirm cards → P5 docs+tests).
2. Dependency: a reachable OpenAI-compatible endpoint for manual/e2e (OpenAI key, or local Ollama).
3. No new runtime npm deps expected (validate during plan).

## Open questions

- Multi-conversation history UI now or later? (Assumed: single active thread persisted, list view later.)
- Confirm granularity: per-tool card vs. a single "apply all proposed"? (Assumed: per-proposal cards + optional "confirm all".)
- Encrypt `AI_API_KEY`? It is an env var (not DB), so out of scope of backlog #15 (DB secrets) — confirm acceptable.
- Should agent context include a rolling dashboard-stats summary in the system prompt, or fetch on demand only? (Assumed: on-demand via tool, leaner prompt.)
