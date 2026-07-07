# PARITY.md — Fourty vs Twenty 2.0

> **Status (2026-07-07): Direction B underway.** Fourty is now on **Postgres**
> with drizzle-kit migrations (Gate B1 done — see `PROGRESS.md`). Multi-tenancy +
> RLS (Gate B2) is the next step and is **not yet implemented**, so the tenancy
> rows below still read ❌. This document tracks the gap as it closes; do not read
> a ✅ into anything not yet backed by a test.

> **Honesty note.** Twenty's capabilities below are sourced from Twenty's
> official docs, release notes, and the 2.0 launch coverage (April 21, 2026) —
> **cited inline** — not from memory. A full local head-to-head (both stacks up
> under Docker Compose on one host) was **not** performed this session: standing
> up Twenty (Postgres + Redis + server + worker + frontend build) plus a shared
> seed harness is a multi-hour effort that belongs in the benchmark task, and I
> will not publish comparison *numbers* I did not measure. Where a cell says
> "not measured", that is a deliberate refusal to fabricate — see Gate A in
> `PROGRESS.md` for the plan to close it.
>
> **The headline.** Fourty and Twenty are not the same class of system. Twenty
> 2.0 is a multi-workspace, Postgres-backed **application platform** with a
> native MCP server, an apps/SDK framework, object+field-level RBAC, and
> auto-generated REST+GraphQL for every object. Fourty is a single-process,
> single-tenant SQLite CRM (~8k LOC). Fourty's genuine edge is *time-to-first-
> value and ops simplicity*; it is **behind on every enterprise-platform axis**.
> This document does not pretend otherwise.

## Legend
✅ present & working · 🟡 partial / caveated · ❌ absent · 📏 not measured

## A. Deployment & ops

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| Self-host | ✅ Docker Compose (Postgres+Redis+workers) [1] | ✅ Docker Compose (Postgres + migrate + app) | Fourty now Postgres-based (B1); worker service in B4. |
| One-command deploy | 🟡 compose stack | ✅ `docker compose up` (authored; healthcheck + migrate one-shot) | Compose not yet run in CI (no daemon); app boots on PG (E2E verified). |
| Reversible migrations | ✅ migration tooling | ✅ drizzle-kit + tested up/down | Was ❌ (idempotent DDL); now versioned + reversibility test. |
| Zero-downtime migration | ✅ | 🟡 expand→migrate→contract documented (ADR-002); demo pending B4 | |
| Helm chart | 🟡 community | ❌ | Neither first-class here. |
| Horizontal scale | ✅ workers, queue | 🟡 stateless app scales; queue/worker in B4 | SQLite ceiling removed; worker pending. |
| Backup/restore | ✅ pg_dump | 🟡 pg_dump possible; tested drill pending B4 | |

## B. Security & multi-tenancy

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| **Multi-tenant workspaces** | ✅ single- & multi-workspace, subdomain per workspace [2] | ❌ **none** | The decisive gap. Fourty has one global dataset. |
| Object-level RBAC | ✅ complete [2][3] | ❌ role column unenforced | |
| Field-level permissions | ✅ view/edit per role [2] | ❌ | |
| OAuth2 + PKCE / SSO (OIDC/SAML) / 2FA | ✅ auth & integration mechanisms expanded in 2.0 [4] | ❌ password + cookie only | |
| Rate limiting | ✅ | 🟡 login only (added this session) | |
| Input validation | ✅ | ✅ zod on all write routes | Genuine parity here. |
| SSRF-guarded webhooks | (n/a public) | ✅ added this session (`src/lib/net.ts`) | |
| Audit log (immutable) | 🟡/✅ | 🟡 timeline, mutable | |

## C. Extensibility & data model

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| Custom **objects** (no-code) | ✅ unlimited, from Settings [2][5] | ❌ only custom *fields* on 3 fixed objects | Fourty has `custom_field_defs`, no custom objects. |
| Custom fields | ✅ | 🟡 defined in UI, **not validated on API write** | |
| Define-as-code (SDK/manifest) | ✅ apps platform: model data, add server logic, React layouts [4][5] | ❌ | Twenty 2.0's headline feature. |
| Auto REST **and** GraphQL for every object | ✅ both, auto-gen [1] | 🟡 hand-written REST only, fixed objects | No GraphQL; README is REST-first honestly. |
| Webhooks (retry + signature) | ✅ | 🟡 fire-and-forget, no retry/signature | |
| Typed TS SDK on npm | ✅ AI-friendly SDK [4] | ❌ | |
| Plugin/app install-uninstall | ✅ apps framework [5] | ❌ | |

## D. AI-native

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| Native MCP server (self-host) | ✅ Claude/ChatGPT/Cursor read+write [4][6] | ❌ | Gate D not started. |
| AI agents / chat in-app | ✅ [4] | ❌ | |
| JSON ops schema for LLMs | ✅ (SDK/MCP) | ❌ | |
| Streaming ops → live UI | ✅ (agents) | ❌ | |
| `llms.txt` / AI integration guide | 🟡 | ❌ | |

## E. Core CRM features (where Fourty is genuinely competitive)

| Capability | Twenty | Fourty | Notes |
|---|---|---|---|
| Contacts/Companies/Deals/Tasks/Notes | ✅ | ✅ | Parity. |
| Kanban pipeline | ✅ | ✅ | Parity. |
| Activity timeline | ✅ | ✅ | Parity. |
| Built-in analytics (forecast/funnel/win-rate/aging) | 🟡 basic | ✅ richer out-of-box | **Fourty ahead** — real code in `stats.ts`. |
| Automatic lead scoring | ❌ (Einstein is Salesforce) | ✅ zero-config, tested | **Fourty ahead.** |
| Multi-currency w/ USD normalization | 🟡 | ✅ 12 currencies, tested | **Fourty ahead.** |
| CSV import w/ fuzzy mapping | ✅ | ✅ | Parity. |
| Views: saved/table/kanban/filter/group | ✅ | 🟡 `saved_views` table exists, thin UI | |
| Virtualized list for large datasets | ✅ | 📏 not verified (likely ❌) | |
| Email/calendar sync | ✅ | ❌ | |
| i18n / a11y | ✅ i18n | ❌ / 📏 | |

## Performance (Gate A) — NOT MEASURED

No head-to-head numbers exist yet, by design (see honesty note). Neither system
was benchmarked this session. Publishing p50/p95/p99, throughput, UI load, or
search latency **requires** the shared-seed repro harness described in
`PROGRESS.md`. Any number not produced by that harness is not a Fourty benchmark.

**Architectural prior (hypothesis, to be tested, not a result):** on a small
single-node dataset (≤100k rows) Fourty's in-process SQLite may show lower API
latency for simple reads (no network hop to Postgres, no GraphQL resolver
layer); at 1M+ rows, with concurrency and complex filters, Twenty's Postgres +
indexes + workers should pull ahead, and Fourty's single-writer SQLite will
bottleneck on concurrent writes. This is a prediction to falsify, not a claim.

## Verdict

Fourty **cannot today replace Twenty for a multi-tenant / enterprise
production** deployment: it lacks multi-tenancy, RBAC enforcement, SSO,
custom objects, GraphQL, an SDK/apps platform, and an MCP server. Fourty **is a
credible choice** for a single small team that wants a zero-ops, self-hosted CRM
with strong built-in analytics and lead scoring, deployed in minutes. The
honest positioning is "the 30-second single-team CRM", not "the Twenty
replacement" — until the Tier-1/Tier-2 gaps in `PROGRESS.md` are closed.

---

### Sources
1. Twenty — GitHub / self-host docs (Postgres+Redis, REST+GraphQL). https://github.com/twentyhq/twenty · https://docs.twenty.com/developers/self-host/capabilities/setup
2. Twenty self-host capabilities — single/multi-workspace, object & field-level permissions. https://docs.twenty.com/developers/self-host/capabilities/setup
3. Twenty permissions discussion (object-level complete, field-level rollout). https://github.com/twentyhq/twenty/discussions/209
4. Twenty 2.0 launch coverage — apps platform, MCP, AI agents/chat, SDK, git-backed workspace versioning. https://www.heise.de/en/news/Twenty-2-0-The-open-source-CRM-follows-up-11268835.html · https://twenty.com/releases
5. Twenty apps/custom objects & no-code workflows from Settings. https://twenty.com/
6. Twenty native MCP server (Cloud, self-host). https://twenty.com/releases

_Last updated: 2026-07-07 (audited commit `9de80c7`)._
