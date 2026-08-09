# Fourty — feature inventory + re-verified comparison vs `trycompai/crm`

_2026-08-09 · Fourty read from `src/**`, `tests/**`, `docs/**`, `plans/**` on branch
`claude/feature-repo-inventory-compare-2c8bdd`. Comp AI read live from
`trycompai/crm` @ `release` **v1.5.1** (2026-08-08, 7.8k★) — README, `docs/agent.md`,
release notes v1.4.0→v1.5.1, and the full git tree via the GitHub API._

**Why this exists:** the previous
[teardown](./competitor-teardown-260808-2159-agentic-crm-upgrade-report.md) was written
2026-08-08 against their **v1.4.0** and against Fourty *before* the agentic upgrade.
Both sides moved since. This re-verifies every row against code, on both sides.

---

## Part 1 — Feature inventory (what Fourty already has)

Verified against source, not against README prose. File paths are the evidence.

### 1.1 Core CRM

| Feature | Evidence |
|---|---|
| Contacts, Companies, Deals, Tasks, Notes | `src/app/api/{contacts,companies,deals,tasks,notes}`, `src/app/(app)/*` |
| Polymorphic activity timeline | `src/lib/activity.ts`, `src/app/api/activities` |
| Kanban pipeline + drag between stages | `src/app/(app)/deals`, `src/app/api/pipelines`, `e2e/kanban.spec.ts` |
| Multi-currency (12) + USD normalisation | `src/lib/currency.ts`, `tests/currency.test.ts` |
| CSV import w/ fuzzy mapping + export | `src/lib/csv.ts`, `api/import/contacts`, `api/export/[entity]` |
| Global search + ⌘K palette | `api/search`, `e2e/command-palette.spec.ts` |
| Saved views (personal/shared) | `api/saved-views`, `tests/saved-views.test.ts` |

### 1.2 Deterministic intelligence (no model)

| Feature | Evidence |
|---|---|
| 0–100 lead scoring | `src/lib/services/contact-score.ts`, `src/lib/scoring.ts` |
| Deal health scoring | `src/lib/services/deal-score.ts`, `src/lib/deal-scoring.ts` |
| Analytics: forecast, funnel, win/loss, velocity, aging, sources | `src/lib/services/stats.ts`, `api/stats/{dashboard,reports}` |

### 1.3 Automation

| Feature | Evidence |
|---|---|
| Visual workflow builder | `src/app/(app)/workflows`, `api/workflows` |
| 6 action types: `create_task`, `add_note`, `update_field`, `webhook`, `log`, `ai_draft` | `src/lib/workflows/types.ts:29-37` |
| Durable queue + worker (pg-boss, no Redis), retry/backoff/DLQ | `src/lib/queue.ts`, `src/worker/{index,dispatch,handlers}.ts` |

### 1.4 Agentic layer (Phases 0–4, shipped 2026-08-08→09)

| Feature | Evidence |
|---|---|
| **Capability registry** — 5 capabilities (`AI_PROVIDER`, `MAILBOX`, `CALENDAR`, `WEBHOOKS`, `CUSTOM_OBJECTS`), printed at boot, injected into prompt, shared `unavailable()` result | `src/lib/capabilities.ts` |
| **Evidence ledger** — 11 evidence kinds priced by weight + `primary` flag; bands VERIFIED .85 / PROBABLE .55 / POSSIBLE .3; contradiction *holds* the fact | `src/lib/facts/evidence.ts` |
| **Three write invariants** — never overwrite a human, never re-offer a DISMISSED value, never apply without a primary source | `src/lib/facts/record-fact.ts:25-31` |
| Fact lifecycle `PROPOSED / APPLIED / DISMISSED / SUPERSEDED` + one-click revert | `record-fact.ts:38,362-447` |
| Write classes A (generative, propose-only) / B (deterministic, may auto-apply) / C (human) | `record-fact.ts:51`, ADR-018 |
| **Agent work ledger** — 6 task kinds with lane/priority/budget, `dueAt`, lease claim | `src/lib/agent-tasks/{kinds,claim,schedule}.ts` |
| **Two-lane dispatcher** — `direct` (no model) vs `session` | `kinds.ts:13`, `src/worker/dispatch.ts` |
| **Keyless research pass** — signature-block parsing, identity matching, domain→company resolution, mail pass | `src/lib/research/{signature,identity,domains,mail-pass,config}.ts` |
| Per-workspace kill switch `research.keyless` | `src/lib/research/config.ts:17` |
| **Per-record agent panel** + durable multi-conversation history | `src/components/agent-panel/*`, `api/ai/conversations/[id]` |
| In-app AI chat (BYO OpenAI-compatible key, off by default), SSE streaming, human-confirmed writes | `src/lib/ai/*`, `api/ai/chat` |
| Action registry (typed actions, JSON schema) | `src/lib/actions/*` (ADR-017) |

### 1.5 Platform / security

| Feature | Evidence |
|---|---|
| Multi-tenant, shared schema, **Postgres RLS (FORCE)** | `tests/tenant-isolation.test.ts` |
| Object-level RBAC (admin/member/viewer) on every mutating route | `tests/rbac-matrix.test.ts` |
| **Field-level permissions** enforced on REST + GraphQL + MCP | `src/lib/field-permissions.ts`, `tests/{field-permissions,graphql,mcp}.test.ts` |
| Immutable audit log (DB-enforced, REVOKE + rules) + CSV export | `src/lib/audit.ts`, `tests/audit-log.test.ts` |
| 2FA / TOTP | `src/lib/totp.ts`, `api/2fa/*` |
| SSO via OIDC (Auth Code + PKCE, JWKS/RS256, JIT provisioning) | `src/lib/sso/*`, `tests/sso.test.ts` |
| Rate limiting w/ `RateLimit-*` headers | `src/lib/ratelimit.ts` |
| SSRF-guarded outbound | `src/lib/net.ts` |
| Secrets at rest (encryption + rekey script) | `src/lib/crypto/*`, `scripts/rekey.ts`, ADR-019 |
| Member management + invites | `api/members/*` |

### 1.6 APIs & extensibility

| Surface | Evidence |
|---|---|
| REST (all objects, incl. custom) | `src/app/api/**`, `api/objects/[object]/[id]` |
| Typed GraphQL | `src/lib/graphql/*`, `api/graphql` |
| **MCP server — 26 tools**, stdio + HTTP, RLS+RBAC enforced | `src/mcp/tools.ts:99`, `api/mcp` |
| Signed webhooks (HMAC-SHA256 + timestamp, replay-guarded, DLQ) | `src/lib/webhook-sign.ts` |
| API keys | `api/api-keys` |
| Custom objects + custom fields (no-code, write-validated) | `src/lib/custom-objects.ts`, `api/custom-objects/*` |
| `@fourty/twenty-migrate` CLI | `packages/`, `tests/twenty-migrate.test.ts` |
| `llms.txt` | `public/llms.txt` |

### 1.7 Ingestion

Email/calendar ingestion; Google + Microsoft **mail OAuth** (Auth Code + PKCE, refresh,
Gmail/Graph fetch → ingest); ICS calendar feeds; extract-at-ingest for signature blocks.
→ `src/lib/sync/{oauth,fetch-mail,parse-email,parse-ics,ingest,pull}.ts`, `tests/sync*.test.ts`.
**Calendar-over-OAuth is still not built** (ICS only).

### 1.8 Ops & UX

i18n (en/vi) · a11y pass · PWA · `/metrics` + OTel + pino · `/health` · `/api/diagnostics` ·
reversible migrations w/ real-PG CI · backup/restore drill · benchmark harness (`bench/`) ·
Docker Compose one-command deploy · **59 vitest suites + 7 Playwright e2e specs**
(`e2e/*.spec.ts`; `auth.setup.ts` is a setup project, `prepare-db.ts` a script) ·
**19 ADR decisions** (`docs/adr/001–019` + a README index = 20 files) · full `docs/` tree.

---

## Part 2 — Re-verified comparison vs `trycompai/crm` v1.5.1

### 2.0 What changed on each side since the 2026-08-08 teardown

**Comp AI (v1.4.0 → v1.5.1, both released 2026-08-07/08):**
- v1.4.0 shipped the **custom-agent platform**: sandboxed builder + runner runtimes
  (CMP-1), durable persisted custom agents, private builder workspace, draft review
  before deployment.
- v1.5.0/v1.5.1: bounded builder retries, draft access summary now declares granted
  write actions, chronological transcript with anchored tool results, schema-drift
  warning in the API.
- Current agent surface: **27 tool files** under `apps/agent/agent/tools/` (the teardown's
  "25+" was right; their README's "18 authored tools" is **stale**), **4 skills**
  (`data-boundaries.md`, `evidence.md`, `identity-matching.md`, `writing-a-brief.md`),
  **1 schedule** (`schedules/dispatch.ts`), plus an `agent_builder` subagent with its own
  sandboxed bash/glob/grep/read tools.

**Fourty:** Phases 0–4 of the agentic upgrade all landed. Five of the eight "steal" ideas
are now in code.

### 2.1 The 2026-08-08 gap table, re-checked

| Gap (as written 2026-08-08) | Status today | Evidence |
|---|---|---|
| Autonomous agent (own work queue, resumes, budget, books follow-ups) | ✅ **closed** — in-process, not a second deployment | `agent-tasks/{kinds,claim,schedule}.ts`, `worker/dispatch.ts`, `recheck` kind |
| Evidence model (no tool may assert confidence) | ✅ **closed** | `facts/evidence.ts` — 11 kinds, bands, contradiction cap |
| Mail → facts (signature/thread-reply/meeting as primary evidence) | ✅ **closed**, keyless | `research/{signature,mail-pass}.ts`; extract-at-ingest in `parse-email.ts` |
| Per-record agent UI + durable conversations | ✅ **closed** | `components/agent-panel/*`, `api/ai/conversations/[id]` |
| Capability awareness | ✅ **closed** | `lib/capabilities.ts` |
| Reads never dead-end | ✅ **closed** | `tests/mcp-neighbours.test.ts` |
| **Enrichment** (LinkedIn, Perplexity, portraits, brand data, briefs) | ❌ **still absent — deliberately** | vendor adapters refused; evidence enum reserves `linkedin.*`/`github.*` as non-primary |
| **Custom agents** (typed permission manifests, pinned versions) | ❌ **still absent — gated** | Phase 5 not started; blocked on an ADR-016 amendment, not on code |
| **Model as config** (self-hoster's admin changes model without redeploy) | ❌ **still open** | `src/lib/ai/provider.ts:17-26` reads `AI_*` env only, though a `settings` table exists (`src/db/schema.ts:492`) |

**Score: 6 of 9 closed in ~24h of work. 1 refused on principle, 1 gated on a decision, 1 genuinely open and cheap.**

### 2.2 Where Fourty leads (re-verified, all still true)

| Dimension | Fourty | Comp AI v1.5.1 |
|---|---|---|
| Tenancy | Postgres RLS multi-tenant | **Single-tenant by design** — no `organizationId` |
| AuthZ | Object RBAC + field-level permissions + immutable audit | `ALLOWED_SIGN_IN` allow-list |
| Public API | REST + typed GraphQL + **MCP (26 tools)** + signed webhooks | tRPC (internal only) — **still no MCP server** (grep of the full tree: the only `mcp` hit is a shadcn dev skill doc) |
| Deploy | 1 process + 1 Postgres, `docker compose up` | 3 deployments + Postgres (+ Vercel Sandbox/Blob/AI Gateway) |
| Runtime deps | 17 runtime deps, zero added by Phases 0–4 | Bun + Turbo + Nest + Prisma + tRPC + eve + Biome |
| Automation | Visual workflow builder on a durable queue | none (agents instead) |
| Ops | reversible-migration CI, benchmark harness, `/metrics`, DLQ, backup drill | not visible |
| Other | i18n, PWA, 2FA, SSO/OIDC, saved views, custom objects, Twenty migration CLI | — |
| Keys required to be useful | zero (keyless research + deterministic scoring) | zero for core; agent needs a model gateway |

### 2.3 Where Comp AI still leads

1. **Custom/team agents.** Natural-language builder → typed permission manifest
   (`SELECTED` vs `WORKSPACE` scope, fail-closed) → human deploy of a pinned version,
   with a sandboxed builder runtime. Fourty's Phase 5 designs the same thing on top of
   the existing action registry + RBAC + audit, but is **deliberately not started**.
2. **Enrichment breadth.** LinkedIn (`linkdapi`), Perplexity search, portraits, brand
   images/mapping, work history, socials, written briefs — 27 tools' worth. Fourty
   refuses vendor coupling; its research is keyless-only.
3. **Model as an admin setting** (`AppSetting.DEFAULT_AGENT_MODEL`) instead of env.
4. **Agent depth.** Subagent delegation, run-state inspection, per-session research
   budget, sandboxed shell tools, telemetry/audit hooks.
5. **Sandboxed execution** with deny-all egress — but Fourty's agent has no shell, so
   this is a non-gap unless Phase 5 ships one.

### 2.4 Positioning after re-verification

The 2026-08-08 framing — "they have the agent, we have the platform" — is **out of date**.
Fourty now has the agent's *safety machinery* (evidence ledger, three invariants, work
ledger, capability registry) plus the platform, and it runs on one process with zero new
dependencies. The honest remaining split:

- **Comp AI = agent depth + enrichment breadth**, bought with three deployments, a vendor
  stack, and single-tenancy.
- **Fourty = the same agent discipline, multi-tenant, keyless, self-hostable, and
  exposed over MCP** — which they still cannot do at all.

The one gap that is *cheap and unprincipled to keep open* is **model-as-config**
(§2.1 row 9): a `settings` table already exists, the read path is one function.

---

---

## Part 3 — Verification pass (2026-08-09, second reader)

An independent pass re-checked the Fourty side against `src/**` and accepted the Comp AI
side from this report's re-read. Corrections **confirmed and applied**:

| Claim | Corrected to | Evidence |
|---|---|---|
| "9 Playwright e2e specs" | **7** — `auth.setup.ts` is a Playwright setup project, `prepare-db.ts` a script | `ls e2e/*.spec.ts` = 7 |
| "20 ADRs" | **19 decisions**, 20 files (README index) | `docs/adr/` |
| ADR-019 covers AI keys | ADR-019 covers **mailbox OAuth refresh tokens + ICS feed URLs only** — AI keys are still env-only | `docs/adr/019-secrets-at-rest.md` |

Doc staleness found and fixed in the same pass:

- `README.md:78` said workflow has "five action types" — code has **six**
  (`src/lib/workflows/types.ts:29-37`). Fixed.
- `PARITY.md:76` said MCP has "10 tools" — code has **26** (`src/mcp/tools.ts:99`);
  every other doc already said 26. Fixed.
- `PARITY.md:77` still read "Round-1 vertical slice … No per-record/async agent yet" —
  false since Phases 0–4. Rewritten to the post-Phase-4 truth. Fixed.

Everything else in Parts 1–2 verified as written, including the 6-of-9 gap table.

## Part 4 — Locked decisions (2026-08-09)

Answers to the four questions below, decided and now binding:

1. **Model-as-config — accept, but later (S–M, not v2.0-freeze-critical).**
   Non-secret knobs (`AI_BASE_URL`, `AI_MODEL`, max tokens, rate) move to the `settings`
   table with **env as fallback**; the **API key stays out of the DB** — env or a sealed
   secret in ADR-019's class. Putting the key in plaintext settings would recreate the
   exact problem ADR-019 fixed. Needs its own **ADR-020** (or a note on 015/016), *not*
   an overload of 019. Schedule after a real mailbox soak; optional prerequisite for
   Phase 3b, whose session lane needs a reachable model without a redeploy.
2. **Phase 5 (custom agents) — closed for this release.** No ADR-016 amendment until
   custom agents are an explicit product priority. The "NO" is strategy, not debt; v2.0
   already delivered the agentic-upgrade promise without it. If it is ever reopened, the
   order is immovable: **docs-only ADR first** (bounds: fail-closed manifest, human
   deploy boundary, narrow-only scope, no shell), *then* `manifest.ts`/`authorize.ts` as
   pure modules, *then* tables and runner, natural-language builder last and draft-only.
3. **Phase 3b (model-backed lane) — deferred** until the keyless pass has run on real
   mailboxes. What must land first: signature-extraction precision / false-positive rate
   on messy real MIME, and human Accept rates on the suggestion inbox (proposal fatigue).
   Shipping a model lane on top of unproven observations is LLM wrappers around noise.
4. **`PARITY.md` stays Twenty-only.** It is the cited product-parity matrix against the
   install baseline customers actually map to; this Comp AI comparison stays a dated
   report with its own cadence. Its AI rows were stale and are now refreshed (Part 3) —
   that is an honesty fix *versus Twenty*, not a Comp AI column.

**Priority order after this report:** (1) soak keyless research + agent panel on real
use → (2) doc hygiene (done in Part 3) → (3) model-as-config when an admin actually
needs it → (4) Phase 3b / Phase 5 only after (1) and an explicit strategy call.

These four stop being default-park **only** if v2.x marketing wants to claim "model
choosable in Settings" (→ Q1 becomes priority) or "custom agents" (→ Q2 becomes priority).

## Unresolved questions

Q1–Q4 are **resolved** — see Part 4. Remaining:

1. Their README says 18 tools while their tree has 27 — our docs should cite the tree
   (verifiable) rather than their README. Not yet reflected anywhere outside this report.
2. **What counts as "soaked"?** Part 4 gates both Phase 3b and model-as-config on a real
   mailbox soak, but no threshold is written down: how many messages, over how long, and
   at what signature false-positive / Accept rate does the gate open?
3. The Comp AI side of this report was re-read from their `release` tree, **not**
   re-cloned and run. Fine for a feature comparison; not fine if a benchmark or a
   behavioural claim is ever made from it.
