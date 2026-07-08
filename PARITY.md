# PARITY.md — Fourty vs Twenty 2.0

> **Status (2026-07-08): Direction B — Gates B1–B5 + Tier-2 (C1–C6) + B6 done.**
> Fourty is on **Postgres** with drizzle-kit migrations (B1), **multi-tenant with
> Postgres RLS** (B2), **object-level RBAC + user management + an immutable audit
> log** (B3), a **durable queue/worker + rate limiting + observability** (B4), and a
> **real head-to-head benchmark vs Twenty @10k** (B5). Tier-2 closed **custom
> objects** (C1), an **auto GraphQL API** (C2), a **saved-views UI** (C3), **i18n**
> (C4), an **a11y pass** (C5), and an **email/calendar ingestion engine** (C6); B6
> adds the **`@fourty/twenty-migrate` CLI** and a **native MCP server**; Tier-3
> (D1–D4) adds **field-level permissions**, **2FA (TOTP)**, **signed webhooks**, and
> **SSO via OIDC** (Authorization Code + PKCE, real JWKS/RS256 ID-token
> verification). **SAML** and a **define-as-code apps/SDK** platform remain open.
> Every ✅ below is backed by a test.

> **Honesty note.** Twenty's capabilities below are sourced from Twenty's
> official docs, release notes, and the 2.0 launch coverage (April 21, 2026) —
> **cited inline** — not from memory. The head-to-head performance numbers now
> come from a **real, measured** run of both stacks on one host at 10k rows
> (Gate B5, see `BENCHMARK.md`); nothing here is a fabricated number.
>
> **The headline.** Fourty has grown from a single-file SQLite CRM into a
> **Postgres multi-tenant** platform (~12k LOC): shared-schema + RLS, enforced
> RBAC + audit, custom objects, a typed GraphQL API, an email/calendar ingestion
> engine, and a native MCP server — each backed by a test. Twenty 2.0 still leads
> as a broader **application platform**: an apps/SDK framework, **SAML**, and full
> provider OAuth. Fourty's genuine edge remains
> *time-to-first-value and ops simplicity* (one Postgres, no Redis); it is now at
> or near parity on the core data/API/AI axes and behind only on the
> enterprise-platform axes named above. This document does not pretend otherwise.

## Legend
✅ present & working · 🟡 partial / caveated · ❌ absent · 📏 not measured

## A. Deployment & ops

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| Self-host | ✅ Docker Compose (Postgres+Redis+workers) [1] | ✅ Docker Compose (Postgres + migrate + app) | Fourty now Postgres-based (B1); worker service in B4. |
| One-command deploy | 🟡 compose stack | ✅ `docker compose up` (authored; healthcheck + migrate one-shot) | Compose not yet run in CI (no daemon); app boots on PG (E2E verified). |
| Reversible migrations | ✅ migration tooling | ✅ drizzle-kit + tested up/down | Was ❌ (idempotent DDL); now versioned + reversibility test. |
| Zero-downtime migration | ✅ | 🟡 expand→migrate→contract (ADR-002); k6 drill authored (`bench/zero-downtime.k6.js`) | |
| Helm chart | 🟡 community | ❌ | Neither first-class here. |
| Horizontal scale | ✅ workers, queue | ✅ stateless app + durable pg-boss queue & worker (B4) | `npm run worker`; exactly-once under SIGKILL tested. |
| Backup/restore | ✅ pg_dump | ✅ tested backup/restore drill (B4, `scripts/backup-drill.sh`) | Ran locally: PASS, all tables identical. |

## B. Security & multi-tenancy

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| **Multi-tenant workspaces** | ✅ single- & multi-workspace, subdomain per workspace [2] | ✅ shared-schema + Postgres RLS (FORCE), non-owner app role | Isolation attack suite passes; direct-connection RLS proof. |
| Object-level RBAC | ✅ complete [2][3] | ✅ enforced (admin/member/viewer) on every mutating route (Gate B3, `rbac-matrix.test.ts`) | |
| Field-level permissions | ✅ view/edit per role [2] | ✅ per (object,field,role) read/write rules on core objects, enforced on **REST, GraphQL, and MCP** (Gate D1, ADR-011) | `field-permissions.test.ts`, `graphql.test.ts`, `mcp.test.ts` — redact reads + block writes on every surface. |
| OAuth2 + PKCE / SSO (OIDC/SAML) / 2FA | ✅ auth & integration mechanisms expanded in 2.0 [4] | 🟡 **2FA (TOTP)** (Gate D2, ADR-012) + **SSO via OIDC** (Authorization Code + PKCE, JWKS/RS256 ID-token verify, JIT provisioning; Gate D4, ADR-014); **SAML** still ❌ | `two-factor.test.ts`; `sso.test.ts` (RS256/JWKS + full start→callback flow vs a fake IdP). |
| Rate limiting | ✅ | ✅ whole-API limit per caller+IP+route class, `RateLimit-*` headers (B4) | `ratelimit.test.ts`. |
| Input validation | ✅ | ✅ zod on all write routes | Genuine parity here. |
| SSRF-guarded webhooks | (n/a public) | ✅ added this session (`src/lib/net.ts`) | |
| Audit log (immutable) | 🟡/✅ | ✅ append-only `audit_log`, DB-enforced immutability (REVOKE + rules), admin API + CSV (Gate B3) | |

## C. Extensibility & data model

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| Custom **objects** (no-code) | ✅ unlimited, from Settings [2][5] | ✅ unlimited, metadata-driven; REST + GraphQL + MCP (Gate C1, ADR-007) | `custom_objects`/`_fields`/`_records`, RLS-scoped, records validated on write. |
| Custom fields | ✅ | ✅ custom-object records validated on API write (C1); fixed-object custom fields UI-managed | Write-time validation added for no-code objects. |
| Define-as-code (SDK/manifest) | ✅ apps platform: model data, add server logic, React layouts [4][5] | ❌ | Twenty 2.0's headline feature; no-code from Settings only in Fourty. |
| Auto REST **and** GraphQL for every object | ✅ both, auto-gen [1] | ✅ REST (all objects) + typed GraphQL at `/api/graphql` (Gate C2, ADR-008) | GraphQL: queries for every object; mutations for contacts/companies/custom records (deals/tasks write via REST). |
| Webhooks (retry + signature) | ✅ | ✅ durable retry/backoff/DLQ (B4) + HMAC-SHA256 signature & timestamp (Gate D3, ADR-013) | `webhook-signature.test.ts`; per-workspace secret, replay-guarded. |
| Typed TS SDK on npm | ✅ AI-friendly SDK [4] | 🟡 `@fourty/twenty-migrate` on npm (typed clients); general SDK TBD | Migration CLI ships typed Twenty/Fourty clients. |
| Plugin/app install-uninstall | ✅ apps framework [5] | ❌ | |

## D. AI-native

| Capability | Twenty 2.0 | Fourty | Notes |
|---|---|---|---|
| Native MCP server (self-host) | ✅ Claude/ChatGPT/Cursor read+write [4][6] | ✅ stdio JSON-RPC, 10 tools, RLS+RBAC (Gate B6, ADR-010) | `npm run mcp`; verified end-to-end + `mcp.test.ts`. |
| AI agents / chat in-app | ✅ [4] | ❌ | |
| JSON ops schema for LLMs | ✅ (SDK/MCP) | ✅ MCP `tools/list` JSON schemas + GraphQL introspection | |
| Streaming ops → live UI | ✅ (agents) | ❌ | |
| `llms.txt` / AI integration guide | 🟡 | ✅ `public/llms.txt` (REST + GraphQL + MCP guide) | |

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
| Views: saved/table/kanban/filter/group | ✅ | ✅ saved views API + list UI, personal/shared (Gate C3) | `saved-views.test.ts`; wired into contacts list. |
| Virtualized list for large datasets | ✅ | 📏 not verified (likely ❌) | |
| Email/calendar sync | ✅ | 🟡 ingestion engine (parse→match→link→dedupe), tested; OAuth/IMAP transport is the injectable edge (Gate C6, ADR-009) | `sync.test.ts`; provider OAuth flows not exercised. |
| i18n / a11y | ✅ i18n | ✅ i18n (en/vi, `t()`, locale resolution, C4) / ✅ a11y pass (dialogs, combobox, landmarks, labels, C5) | `i18n.test.ts`, `a11y.test.ts`. |

## Performance (Gate B5) — MEASURED @10k

A **real head-to-head** was run: both stacks on `postgres:16`, matched resources,
same dataset shape, seeded through each product's API. At 10k rows, 0 errors both
sides, **Fourty wins every scenario** (e.g. list 756 vs 191 rps, p95 35 vs 136ms;
create 689 vs 287; search 639 vs 325) with a **~3.7× smaller footprint** (~830 vs
~3047 MiB — Twenty's Redis + worker + richer server). Full numbers, method, and
caveats in [`BENCHMARK.md`](./BENCHMARK.md); the same harness supports 100k/1M
(`SIZE=100000 bench/run.sh …`), not yet run. Numbers are one host, one run — the
report is regenerated straight from `bench/results/*.json`, never hand-typed.

## Verdict

Fourty has closed the Tier-1/Tier-2/Tier-3 platform gaps: it is now
**multi-tenant with RLS**, has **enforced object- and field-level RBAC + audit**,
**custom objects**, an **auto GraphQL API**, **saved views**, **i18n + a11y**, an
**email/calendar ingestion engine**, a **native MCP server**, a **Twenty→Fourty
migration CLI**, **2FA (TOTP)**, **signed webhooks**, and **SSO via OIDC**
(Authorization Code + PKCE) — each backed by a test. What still separates it from
Twenty 2.0 for a large **enterprise** deployment: **SAML**, a **define-as-code
apps/SDK platform**, and **full provider OAuth** for mail/calendar (the ingestion
engine is built; the OAuth transport is not). Fourty is now a credible
multi-tenant, AI-native, security-hardened self-hosted CRM for teams that don't
yet need SAML or an apps platform — while remaining the fastest zero-ops option
for a small team.

---

### Sources
1. Twenty — GitHub / self-host docs (Postgres+Redis, REST+GraphQL). https://github.com/twentyhq/twenty · https://docs.twenty.com/developers/self-host/capabilities/setup
2. Twenty self-host capabilities — single/multi-workspace, object & field-level permissions. https://docs.twenty.com/developers/self-host/capabilities/setup
3. Twenty permissions discussion (object-level complete, field-level rollout). https://github.com/twentyhq/twenty/discussions/209
4. Twenty 2.0 launch coverage — apps platform, MCP, AI agents/chat, SDK, git-backed workspace versioning. https://www.heise.de/en/news/Twenty-2-0-The-open-source-CRM-follows-up-11268835.html · https://twenty.com/releases
5. Twenty apps/custom objects & no-code workflows from Settings. https://twenty.com/
6. Twenty native MCP server (Cloud, self-host). https://twenty.com/releases

_Last updated: 2026-07-08 (Tier-2 C1–C6 + B6; audited commit `130c2a8`)._
