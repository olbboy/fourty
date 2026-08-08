# Agentic CRM upgrade — Fourty

**Status:** ready · **Created:** 2026-08-08 · **Branch:** `main`
**Source:** [competitor teardown](../reports/competitor-teardown-260808-2159-agentic-crm-upgrade-report.md) of `trycompai/crm`

## Goal

Move Fourty's AI from *a chat box that reads the CRM* to *a background worker that keeps the CRM true* — without adding a service, a broker, or a vendor. Everything below runs in the existing Next process + worker + Postgres.

## Decisions (locked 2026-08-08, verified against code)

1. **Schema polymorphic** (`entity_type`/`entity_id`, same pattern as `tasks`/`notes`/`activities`); v1 writers + UI are contact-first. Company is touched only via `company_id` resolution, never a parallel employer string.
2. **Auto-apply is a carve-out, not the rule.** Only *deterministic* research (class B below) may apply, and only to a field that is **not human-owned** — empty, or still holding that pass's own applied value — at **VERIFIED** with ≥1 primary source. Generative/session writes (class A) stay propose-only — ADR-015/016 HITL holds for them. Every APPLIED fact gets a one-click **Revert** (restore previous value, mark the reverted value DISMISSED, append `fact.reverted` to audit). Recorded in **[ADR-018](../../docs/adr/018-evidence-and-research.md) (Accepted 2026-08-09)**, as a documented amendment to ADR-016 guardrail #4 — written ahead of Phase 1 rather than inside it.
   - Class A — generative (chat, session research, custom agents): propose-only, `via:"ai"` / `agent:<versionId>`.
   - Class B — deterministic parsers + ledger (signature, thread-reply, meeting): may auto-apply under the rule above, `via:"research"`, `actorId: null`.
   - Class C — human (UI/import/API/MCP-as-user): normal writes.
3. **Install telemetry: out.** No phone-home in OSS Fourty; revisit only if a hosted tier ever exists.
4. **Keyless research decoupled from AI.** Default **on** once a mailbox is connected; per-workspace kill switch (`research.keyless`); AI chat stays off-by-default. Connecting a mailbox is the consent to process that mail inside the tenant — documented in `SECURITY.md` + research guide.
5. **Phase 3 hard prerequisite:** Fourty stores only a 280-char head `snippet` (`parse-email.ts:74`) — signature blocks live at the *end* of bodies and are currently discarded at ingest. Phase 3 requires **extract-at-ingest** (no body at rest). Historical mail: research starts from next sync; no backfill re-fetch in v1.
6. **Phase 5 stays optional** and may not start before ADR-016's "autonomous in-app agents: NO" line is formally amended.

## Constraints (non-negotiable)

- One process, one Postgres, no Redis, no second deployment. New runtime deps: **zero** (Phase 0–4).
- Every write path stays inside `withWorkspace()` → RLS + audit hold end-to-end.
- Existing public contracts (REST/GraphQL/MCP/webhooks) stay compatible; new surfaces are additive.
- BYO-key AI stays optional and off by default. **Phases 0–2 and the parsing half of Phase 3 must work with no LLM configured at all.**
- No feature adopts a Vercel-specific service (Sandbox, Blob, AI Gateway).

## Phases

| # | Phase | Size | Depends on | File |
|---|---|---|---|---|
| 0 | Capability registry, prompt grounding, non-dead-end reads ✅ done | S | — | [phase-00](./phase-00-capabilities-and-grounding.md) |
| 1 | Evidence ledger + suggestion inbox ✅ done | M | 0 | [phase-01](./phase-01-evidence-ledger.md) |
| 2 | Agent work ledger + two-lane dispatcher ✅ done | M | 0 | [phase-02](./phase-02-agent-work-ledger.md) |
| 3 | Keyless research pass (mail/calendar → evidence) — keyless half ✅ done, model-backed lane open | L | 1, 2 | [phase-03](./phase-03-keyless-research-pass.md) |
| 4 | Per-record agent panel + durable conversations | M | 0 (1/3 for content) | [phase-04](./phase-04-per-record-agent-panel.md) |
| 5 | Custom agents with typed permission manifests | L | 1, 2, 4 | [phase-05](./phase-05-custom-agents.md) |

Phases 1 and 2 are independent of each other and can run in parallel (disjoint files). Phase 3 needs both. Phase 1's dependency on 0 is soft (quality, not files) — it may start in parallel if needed; the only hard edges are 3 → 1+2 and 5 → 1,2,4.

## Acceptance criteria (whole plan)

1. ✅ (2026-08-09) A fresh install with **no** API keys, once a mailbox is connected: **empty** contact fields (job title, company link) are auto-filled from mailbox evidence with a visible source for each; a job change against a **human-owned** field is *proposed*, never overwritten.
2. No AI-originated value ever overwrites a human-entered one, and no dismissed suggestion is ever re-offered. Both proven by tests against real Postgres.
3. Every background decision is answerable: *what will the agent do to this record, when, and why* — from a table, not a log.
4. `npm test`, `npm run test:e2e`, `npm run build` stay green; migrations stay reversible in CI.
5. Runtime dependency count unchanged through Phase 4.

## Explicitly out of scope

Bun/Turbo/Nest/tRPC/Prisma migration · splitting the deployment · a model sandbox/shell · third-party enrichment vendors (Phase 3 is keyless; a vendor adapter is a later, optional capability) · anonymous install telemetry (**out** — Decision 3, no phone-home).

## Backlog items this closes

- **#3** AI agents — per-record assistant (Phase 4), async/worker agent (Phases 2–3), multi-conversation history UI (Phase 4).
- **#4** Streaming for background ops (Phase 4).
- **#14** Periodic mail auto-pull (Phase 2 — a task kind, not a cron). ✅ done
