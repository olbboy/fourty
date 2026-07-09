# ADR-015 — In-app AI agent / chat (stop-at-write, BYO provider)

**Status:** Accepted · **Date:** 2026-07-09

## Context
Fourty exposes its data to LLMs over MCP, but had no *in-app* conversational
agent — Twenty 2.0 ships one. We want a chat where a user asks about their CRM in
natural language (VI/EN) and the agent reads data and performs changes, without:
(a) adding heavy dependencies, (b) letting the agent write autonomously, or
(c) letting it exceed the caller's role. It must be optional so a self-hoster who
sets no LLM key keeps `docker compose up` unchanged.

## Decision
**Approach A — an in-request agentic loop that stops at the first write, streams
tokens over hand-rolled SSE, and reuses the existing 10 MCP tools + the auth seam.
The LLM is BYO OpenAI-compatible and optional.**

- **BYO provider, no SDK** (`src/lib/ai/provider.ts`): `streamChat` is a hand-rolled
  `fetch` to `${AI_BASE_URL}/chat/completions` (`stream:true`), parsing the SSE body
  and reassembling tool-call argument fragments (keyed by `index`) into whole calls.
  `max_tokens` is always sent — never an uncapped completion. Zero new runtime deps.
  Tested against OpenAI/Groq/OpenRouter; local Ollama/LM Studio are best-effort (the
  agent degrades to a text-only assistant when a model emits no `tool_calls`).
- **One tool list** (`src/mcp/tools.ts`): `TOOLS` is the single source of truth for
  MCP *and* the agent. A `mutates` flag drives read-inline vs propose-and-stop; a
  `via` field on `ToolContext` makes the tool's own audit row read `via:'ai'` (so
  the agent never double-audits).
- **Stop-at-write loop** (`src/lib/ai/agent.ts`, ≤8 steps/turn): read tools run
  inline (sequentially, not in parallel — the shared pool is small); the first turn
  that proposes a write persists it `pending_confirmation` and ends the stream in
  `awaiting_confirmation`. Confirmation is a **fresh request** that atomically claims
  the proposal (a CAS so a double-click executes it once), runs it from the
  **server-persisted** args (client args are never trusted), and resumes. Writes are
  never auto-executed — the core safety guarantee.
- **No long transaction across streaming** (`src/app/api/ai/chat/route.ts`): the
  route authenticates with the lower-level `authenticate()` and opens a
  `withWorkspace()` only around each tool/persist — an LLM stream never holds a
  Postgres transaction open. Because that bypasses `withAuth`, the route re-adds the
  observability seam itself (`request_id`, `withContext`, `recordHttp` + access log
  at stream close). RBAC/RLS/field-permissions are enforced by the reused tools,
  exactly as on REST/MCP.
- **Persistence** (`0011_ai_chat`, reversible): `ai_conversations` + `ai_messages`,
  workspace-scoped + RLS like every tenant table, with a real FK and per-user
  ownership (RLS isolates tenants; a `user_id` ACL in the store isolates
  workspace-mates). Messages carry the provider round-trip shape and a `status`
  machine; a monotonic `seq` guarantees replay order.
- **Cost guardrails:** `AI_MAX_TOKENS` per completion + a per-user
  `AI_RATELIMIT_PER_HOUR` (default 60, every role) returning `429`.
- **Client** (`src/components/ai-chat.tsx` + `src/lib/ai/sse-client.ts`): a drawer
  reading the SSE over `fetch`/`ReadableStream` (no `EventSource`); it restores the
  active thread on open, including a **live confirm card** for any still-pending
  write. Hidden entirely when AI is disabled.

### Why not an agent SDK / autonomous writes / async worker?
An SDK would add a heavy dependency for what is a few hundred lines of `fetch` + SSE
parsing. Autonomous writes are the wrong default for a CRM — a mis-parsed intent must
never silently mutate data, so writes are structurally human-confirmed. An async
worker agent (Twenty-style background ops) is deferred: round-1 is one bounded
in-request loop, which is simpler to reason about and keeps the safety invariant
local to a single request.

## Consequences
- **Positive:** optional + zero new deps; the agent can never exceed the caller's
  role; writes are auditable (`via:'ai'`) and confirmed; the stream holds no DB
  transaction; one tool list for MCP + agent.
- **Deferred (round-1 out of scope):** per-record assistant, async/worker agent,
  workflow-trigger + `update_*`/`delete_*` tools, a multi-conversation history UI
  (a single active thread is persisted), and encrypting `AI_API_KEY` at rest.
- **Trade-off:** the in-process rate limiter is per-instance (documented, like the
  rest of the limiter); tool-calling fidelity depends on the chosen provider —
  local models without tool-calling degrade to text-only.

_Related: ADR-010 (MCP server, the reused tools), ADR-005 (authz), ADR-001 (RLS)._
