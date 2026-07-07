# CLAIMS.md — Ground-truth audit of Fourty

> **Purpose (RULE #0).** Every claim the README/marketing makes, checked against
> the actual code and against passing tests — not against comments or prose.
> Verdicts: **DONE** (code + evidence), **PARTIAL** (works but with caveats),
> **MISSING** (claimed capability not in code), **FALSE** (claim contradicts
> reality/is fabricated).
>
> Audited commit: `9de80c7` (branch `claude/fourty-production-readiness-8q6wyl`).
> Date: 2026-07-07. Method: read all of `src/**` (~8.1k LOC), ran the test suite
> and production build, exercised route handlers via new integration tests.
>
> **Verified facts up front:**
> - Test suite: **55 tests passing** (was 33 before this session; +22 API
>   integration / auth / security tests added here). `npx vitest run` → green.
> - Production build: `npm run build` → **green** (Next.js 15, 24 routes).
> - Architecture: **Next.js App Router + SQLite (better-sqlite3) + Drizzle**, a
>   single Node process. **~8.1k LOC.**

## Feature claims

| # | Claim (README) | Verdict | Evidence / caveat |
|---|---|---|---|
| 1 | "Deploys in 30 seconds", one process, SQLite | **DONE** | `npm run build && npm start` works; `Dockerfile` present; single `better-sqlite3` process; DB auto-bootstraps via DDL in `src/db/index.ts`. |
| 2 | Analytics: forecast, funnel, win-rate, sales-cycle, revenue trend, aging, sources, stale deals | **DONE** | Real implementations in `src/lib/services/stats.ts` (`computeDashboardStats`, `computeReportStats`: `winRate`, `funnel`, cycle length, `sourceBreakdown`, `aging`, `scoreBands`, `winLoss`). Exposed at `/api/stats/dashboard`, `/api/stats/reports`. **Not yet covered by tests** (logic only). |
| 3 | Automatic lead scoring, zero-config, 0–100 | **DONE** | `src/lib/scoring.ts` (pure, 7 passing tests in `tests/scoring.test.ts`); recompute service `src/lib/services/contact-score.ts`; invoked on contact create. |
| 4 | Workflow automation: visual builder, 5 action types, conditions, `{{templates}}`, run history, in-process | **DONE** | Engine `src/lib/workflows/engine.ts` (create_task, add_note, update_field, webhook, log); conditions `evaluate.ts`; builder UI `workflow-builder.tsx`; `workflow_runs` table records history. Tested: `tests/engine.test.ts`, `tests/workflow-evaluate.test.ts` + new HTTP-level dispatch test in `tests/api-integration.test.ts`. |
| 5 | Multi-currency, 12 currencies, USD-normalized reporting | **DONE** | `src/lib/currency.ts` (6 passing tests). |
| 6 | Responsive PWA + bottom nav, dark mode | **PARTIAL** | `src/app/manifest.ts`, mobile nav in `src/components/shell.tsx`, theme toggle present. Verified to *build*; **no automated UI/E2E test or Playwright trace** yet, so responsiveness/PWA-install is asserted by code inspection only. |
| 7 | Custom fields: UI-managed, "instant in forms & **API**" | **PARTIAL** | `custom_field_defs` table + `custom-fields` UI + CRUD API exist. Values pass through as opaque JSON on write (`custom` column). **Caveat: writes are NOT validated/typed against the field definitions** — the API accepts any `custom` object regardless of defined fields/types/required flags. "Appears in API" = true; "enforced by API" = false. |
| 8 | CSV import: fuzzy header mapping + company auto-linking; export | **DONE** | `src/lib/csv.ts` (RFC-4180, 8 passing tests); `/api/import/contacts` fuzzy `pick()` + company auto-create; `/api/export/[entity]`. |
| 9 | REST API for every resource, Bearer-token API keys | **DONE** | 24 route files; 21 call `authenticate()` (the 3 that don't are the auth endpoints themselves). Keys SHA-256-hashed (`api_keys.keyHash`), revocable (`revokedAt`). Now covered by `tests/api-auth.test.ts` + `tests/api-integration.test.ts`. |
| 10 | ⌘K command palette, global search | **PARTIAL** | `src/components/command-palette.tsx` + `/api/search`. Present; no test. |
| 11 | License MIT | **DONE** | `LICENSE` (MIT). |
| 12 | Polymorphic activity timeline on every record | **DONE** | `activities` table (entityType/entityId), written on create/update/stage-change; timeline UI in record pages. |
| 13 | API keys "SHA-256-hashed at rest and revocable" | **DONE** | `sha256(key)` stored; `authenticate()` checks `isNull(revokedAt)`; revoked-key rejection now tested. |
| 14 | Outbound webhooks (workflow action) | **DONE (hardened)** | `webhook` action in engine. **This session added SSRF protection** (`src/lib/net.ts`) — see Security below. |
| 15 | Self-initializing schema + default 7-stage pipeline + demo seed | **DONE** | DDL bootstrap in `src/db/index.ts`; `ensureDefaultPipeline()` + `seedDemoData()` in `src/db/seed.ts`. |

## Architecture / positioning claims

| Claim | Verdict | Note |
|---|---|---|
| "Drizzle ORM, so a Postgres driver can be swapped in when you outgrow SQLite" | **PARTIAL / misleading** | The schema is Drizzle, but the DB layer hard-codes `better-sqlite3`, uses a **raw SQLite DDL string** (not portable to Postgres), and integer-epoch timestamps. There are **no migrations** (`CREATE TABLE IF NOT EXISTS` only). A real Postgres swap is a project, not a driver flip. |
| "33 tests" | **WAS TRUE → now 55** | 33 at audit start; +22 added this session. |
| Comparison table vs Twenty ("Workflow ✅ vs Limited", "Analytics: Twenty Basic", "Custom fields ✅ vs ✅", "Mobile: Twenty ❌") | **PARTIALLY OUTDATED** | Measured against **Twenty 2.0** (Apr 2026): Twenty ships no-code workflows, unlimited custom objects, an apps platform, a native MCP server, and object+field-level RBAC. Several "Twenty ❌/Limited" cells no longer hold. See `PARITY.md`. |

## Gaps found (claimed-or-implied capabilities that are NOT present)

These are **not** false README claims (the README mostly doesn't claim them) but
are implied by "production CRM" / the mission's gates, and are **absent**:

| Area | Status | Evidence |
|---|---|---|
| **Multi-tenancy / workspace isolation** | **MISSING** | No `workspace`/`tenant`/`organization` table; **no tenant column on any CRM table**. "Workspace" appears only as UI copy. One global dataset shared by all users. |
| **RBAC enforcement** | **MISSING** | `users.role` exists (`admin`/`member`; setup makes first user `admin`) but **no route checks it**. Any authenticated principal can do everything (delete records, mint/revoke API keys, manage workflows). Also: **no user-management/invite API** exists, so the app is effectively single-user today. |
| **API-key scopes** | **MISSING** | `api_keys` has no scope column; a valid key grants **full read+write to every endpoint**. (README does not claim scopes — honest, but the mission's Gate C requires them.) |
| **Rate limiting** | **PARTIAL (added)** | None existed. This session added an in-process limiter (`src/lib/ratelimit.ts`) applied to `/api/auth/login`. Not yet applied fleet-wide to the data API. |
| **Migrations (up/down, reversible)** | **MISSING** | Idempotent `CREATE TABLE IF NOT EXISTS` only. **Latent upgrade bug:** adding a column to the DDL later will *not* apply to existing databases (no `ALTER`), so upgrades silently miss new columns. |
| **Observability** (structured logs, metrics, tracing) | **MISSING** | No Prometheus/OTel/structured logging. `console.log` in seed only. |
| **MCP server** | **MISSING** | No MCP server (Gate D). |
| **`@fourty/twenty-migrate`** | **MISSING** | No migration tool from Twenty (Gate C). |
| **Head-to-head benchmark vs Twenty** | **MISSING** | No benchmark harness/repro. **No fabricated numbers exist** — good. Building a real one is future work (see PROGRESS.md). |
| **SSO / OAuth2+PKCE / 2FA** | **MISSING** | Auth is email+password (scrypt) + opaque session cookie only. No OAuth, OIDC/SAML, or 2FA. |
| **Audit log (immutable)** | **PARTIAL** | `activities` is an append-style timeline but is not tamper-evident, not settings-scoped, and is deletable. |
| **i18n / a11y** | **UNVERIFIED** | No i18n framework found; no a11y test. Not claimed by README; required by mission Tier 2. |

## What this session changed (with tests)

| Change | File(s) | Test |
|---|---|---|
| Login brute-force rate limiting (429 + Retry-After) | `src/lib/ratelimit.ts`, `src/app/api/auth/login/route.ts`, `src/lib/api.ts` | `tests/security.test.ts` (rate limiter) |
| Webhook **SSRF guard** (block private/loopback/link-local/metadata; opt-out env) | `src/lib/net.ts`, `src/lib/workflows/engine.ts` | `tests/security.test.ts` (isPrivateIp + checkWebhookUrl) |
| First **API integration tests** (CRUD, validation, workflow dispatch over HTTP) | — | `tests/api-integration.test.ts` (6) |
| **Auth-enforcement** tests + static guard (no route may skip `authenticate()`) | — | `tests/api-auth.test.ts` (4) |

Net: **33 → 55 passing tests**, build green, two real security bugs fixed.
