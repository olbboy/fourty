# ADR-016 — AI-native strategy: don't chase Twenty's platform; be the best substrate for AI

**Status:** Accepted — Tier 1 + Tier 2 + Tier 3 implemented · **Date:** 2026-07-09

> **Relationship to ADR-015 (in-app AI agent / chat).** ADR-015 shipped an
> optional in-app conversational agent with a **stop-at-write** loop (proposes
> writes, a human confirms). This strategy ADR is complementary, not contradictory:
> its "don't do" list warns against betting the roadmap on an agent *platform* /
> apps-SDK — not against a single, guarded, off-by-default chat. The two share the
> guardrails here (governance inheritance via the same MCP tools + `via` audit
> tagging, human-in-the-loop on writes). Tier 3 below (the `FOURTY_AI_*` draft
> layer) is a separate, narrower surface from ADR-015's chat.

> **Implementation (2026-07-09).** Tier 1 shipped: the MCP tool catalogue grew
> 10 → 20 (full CRUD for contacts/companies, deal create/update/delete, tasks,
> notes; delete tools are dry-run unless `confirm: true`), an **HTTP transport**
> at `POST /api/mcp` (Bearer key or session; single or batch JSON-RPC) reusing the
> same `handleMcpRequest` — so RLS/RBAC/field-perms are enforced identically — and
> MCP **resources** (`fourty://dashboard`, `fourty://custom-objects`) + **prompts**
> (`summarize_pipeline`, `draft_followup`). Tier 2 shipped: a deterministic
> **deal health score** (`src/lib/deal-scoring.ts` + `services/deal-score.ts`,
> migration `0011`, wired into the deals REST routes and the MCP deal tools).
> Tier 3 shipped as designed — **off by default, BYO-key, human-in-the-loop**:
> an `ai_draft` workflow action enqueues an `ai.generate` job whose worker calls a
> provider-agnostic thin-`fetch` client (`src/lib/ai` — Anthropic / OpenAI /
> local Ollama; enabled only via `FOURTY_ENABLE_AI=1` + a key) and writes the
> result as a **draft note** (never a record mutation), audited `via:"ai"`. No
> heavy SDK was added — the core stays at ~10 runtime deps. 206 tests pass
> (was 185); the generative path was verified end-to-end against a local model.

## Context

Twenty 2.0 leads on the *AI-platform* axis: in-app AI chatbot + AI agents in
workflows, an AI-friendly SDK (`create-twenty-app`) to author AI skills, a native
MCP server, and streaming. Fourty's AI-native surface today is deliberately
narrow: a hand-rolled MCP server (10 tools, RLS+RBAC+field-perm enforced),
deterministic rule-based lead scoring, `public/llms.txt`, and GraphQL
introspection — with **no generative AI, no in-app agents, no streaming** (a
full-tree grep confirms zero AI/LLM dependencies).

The question this ADR settles: **should Fourty add the AI capabilities it lacks
relative to Twenty, and if so which ones?**

### Twenty 2.0's AI limitations (sourced from Twenty's own docs + 2026 reviews)

These are the openings a challenger should aim at, not the strengths to copy:

1. **Non-deterministic** — Twenty's AI docs state "AI can make mistakes." An
   agent that writes to a system of record via natural language is risky without
   a validation layer.
2. **Costs money at scale** — "can be expensive at scale"; Twenty ships
   `AI_BILLING_ENABLED` / `AI_MONTHLY_BUDGET` to cap per-token spend.
3. **External provider + privacy** — self-host AI requires `AI_PROVIDER` +
   `OPENAI_API_KEY`; CRM data leaves the box and a third-party dependency is
   added — in tension with the "own your data / self-host" premise.
4. **Lead scoring / predictive analytics are still "coming soon"** in Twenty —
   Fourty already ships this, deterministically. A genuine gap in the incumbent.
5. **AGPL-3.0** copyleft creates legal/embedding friction; Fourty is MIT.
6. **Paid-tier gating + youth** — AI/reporting/row-level lean toward the paid
   Cloud tier with plan usage limits; ecosystem and support are still young.

## Decision

**Do not build an in-app agent framework or an apps/SDK platform.** Fourty cannot
out-resource Twenty on platform breadth, and doing so contradicts its moat
(zero-ops, deterministic, MIT, ~10 runtime deps). Instead, invest along three
tiers that are *asymmetric* — cheap for Fourty, aligned with the existing ethos,
and aimed where Twenty is weak.

Each item was scored on five axes — ethos fit, leverage/differentiation, effort,
risk (for a young, no-E2E codebase), and whether Twenty is actually strong here:

| Missing capability | Verdict |
|---|---|
| MCP breadth (full CRUD + HTTP/SSE transport + resources/prompts + write-safety) | **ADD — Tier 1** |
| Deterministic intelligence (deal scoring, next-best-action, dedupe) | **ADD — Tier 2** |
| Generative (draft/summary/enrich) | **CONDITIONAL — Tier 3** (opt-in, BYO-key, off by default) |
| In-app autonomous AI agents (as a core feature) | **NO** |
| AI SDK / apps platform (à la `create-twenty-app`) | **NO** |
| Streaming AI → UI | **DEFER** |

### Tier 1 — Be the best substrate for external AI (highest leverage, best fit)
- Add `update_*`/`delete_*` tools and write tools for deals/tasks/notes plus a
  `run_workflow` tool by appending to `TOOLS[]` in `src/mcp/tools.ts` (the
  `create_contact` guard chain — `requireRole` → `requireWritableFields` → zod →
  mutate → `audit`/`logActivity` → `redact` — is the template; the server picks
  new tools up automatically via `toolByName` / `tools/list`).
- Add an **HTTP/SSE MCP transport** (`src/app/api/mcp/route.ts`, mirroring
  `src/app/api/graphql/route.ts`, reusing `resolveContext` from
  `src/mcp/stdio.ts`) so hosted clients (e.g. ChatGPT connectors) can connect on
  the OSS build — precisely where Twenty ties MCP to Cloud/OAuth.
- Add MCP **resources** and **prompts** (new `case` arms + capability keys in
  `src/mcp/server.ts`).
- Turn write-safety into a selling point: dry-run/confirm, per-key scopes,
  rate-limits.

### Tier 2 — Deterministic intelligence, no LLM (cheapest differentiation)
- `computeDealScore` / `recomputeDealScore` cloning the pure-scorer + adapter
  split of `src/lib/scoring.ts` + `src/lib/services/contact-score.ts`; inputs
  (days-in-stage, stage `winProbability`, amount, recency) are already derived in
  `src/lib/services/stats.ts`. Needs a reversible migration adding `score` to
  `deals`.
- Rules-based next-best-action and duplicate detection. All deterministic,
  testable, zero-dependency — and Twenty's equivalent is "coming soon."

### Tier 3 — Optional, guarded generative (only on demand)
- New workflow action `ai_summarize` / `ai_draft`: extend the `WorkflowAction`
  union (`src/lib/workflows/types.ts`) and the `runAction` switch
  (`src/lib/workflows/engine.ts`), enqueuing an `ai.generate` job exactly like the
  `webhook` action does (durable queue → worker → retry/backoff/DLQ). Register the
  job in `src/lib/queue.ts` (`JobPayloads`/`JOB_NAMES`/`QUEUE_CONFIG`) with a
  handler in `src/worker/handlers.ts`.
- Bring-your-own-key via the disabled-by-default idiom: `aiClientFromEnv():
  AiClient | null` reading `ANTHROPIC_API_KEY` / `AI_PROVIDER` / a
  `FOURTY_ENABLE_AI` flag (template: `clientFromEnv()` → `null` in
  `src/lib/sync/oauth.ts`; boolean flag in `src/lib/net.ts`; no-op-unless-set in
  `src/lib/otel.ts`). Per-workspace keys live in the RLS-scoped `settings` table.
- Output is a **draft** (note/task), tagged `audit(via:"ai")`, outbound-guarded by
  `checkWebhookUrl`, local-model friendly.

### Guardrails (binding on any AI work)
1. **Privacy-first** — BYO-key, off by default, local models supported.
2. **Determinism-first** — prefer a rule to an LLM wherever a rule suffices.
3. **Governance inheritance** — AI mutations go through the same tool/service
   helpers, never raw `db` calls, so they inherit `withWorkspace` (RLS), `can`
   (RBAC), field-permissions, and audit for free.
4. **Human-in-the-loop** — AI drafts; a human commits to the system of record.
5. **Keep the identity** — MIT + dependency-light: thin `fetch` over a heavy SDK;
   the core stays ~10 deps and installs in 30 seconds.

## Consequences

- Fourty's differentiated position becomes "the safest, fully-OSS self-hostable
  substrate for *your* AI" + deterministic intelligence Twenty lacks — rather than
  a thinner clone of Twenty's AI platform.
- Generative AI is reachable but never a default dependency, preserving the
  privacy/zero-dep/MIT posture that is Fourty's actual moat.
- Explicitly out of scope: an autonomous in-app agent framework, an apps/SDK
  platform, mandatory/bundled generative AI, and streaming-to-UI (no
  `ReadableStream` precedent exists in the repo; marginal for a system of record).
- Consistent with ADR-004 (no Redis), ADR-010 (hand-rolled MCP, no SDK), and the
  anti-vanity rule: nothing here is "done" until it ships with a passing test.

### Sources
- Twenty AI docs (providers, `AI_ENABLED`/`AI_PROVIDER`/`OPENAI_API_KEY`,
  "can make mistakes", "expensive at scale", "coming soon: lead scoring"):
  Twenty documentation · https://twenty.com/product · https://twenty.com/pricing ·
  https://github.com/twentyhq/twenty · 2026 review coverage.
