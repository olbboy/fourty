# CLAIMS.md — Ground-truth audit of Fourty

> **Purpose (RULE #0).** Every claim the README/marketing makes, checked against
> the actual code and against passing tests — not against comments or prose.
> Verdicts: **DONE** (code + evidence), **PARTIAL** (works but with caveats),
> **MISSING** (claimed capability not in code), **FALSE** (claim contradicts
> reality/is fabricated).
>
> Audited commit: `0c85c10` (branch `main`). Date: 2026-08-09.
> Method: each README claim traced to the code that implements it and the test
> that pins it; full suite, production build and E2E run locally against real
> Postgres 16. Counts below were counted, not quoted.
>
> **Verified facts up front:**
> - Test suite: **573 passing, 2 skipped**, 57 files, on **real Postgres + RLS**
>   (`npx vitest run` → green). The 2 skips are declared gaps, listed below.
> - E2E: **16 Playwright smoke tests** across 7 files (+1 setup project) → green.
> - Production build: `npm run build` → **green** (Next.js **16.3.0**, 80 routes).
> - Architecture: **Next.js App Router + Postgres 16 + Drizzle**, one web process
>   plus one worker. **~23.5k LOC** across `src/` and `packages/`.
> - Runtime dependencies: **16** — drizzle-orm, graphql, next, pg, pg-boss, pino,
>   react, react-dom, recharts, zod, plus the six the shadcn/ui component layer
>   pulls in: @base-ui/react, class-variance-authority, clsx, cmdk, lucide-react,
>   tailwind-merge. Ten of those sixteen are the server; six are the UI kit.
> - Migrations: **17 up + 17 down**, reversibility asserted in CI.

## Feature claims

| # | Claim (README) | Verdict | Evidence / caveat |
|---|---|---|---|
| 1 | "Deploys in 30 seconds" — Compose brings up Postgres, migrates, starts app **and worker** | **DONE** | `docker-compose.yml` (postgres → migrate → app + worker), `Dockerfile`. |
| 2 | One process + one Postgres, **no Redis**, no broker | **DONE** | Queue is pg-boss on Postgres (`src/lib/queue.ts`); no Redis anywhere. The infrastructure claim is about services to operate, not package count: 16 runtime dependencies, of which 10 are the server and 6 are the shadcn/ui component layer. |
| 3 | Postgres **multi-tenancy with Row-Level Security** | **DONE** | 9 migrations enable RLS, **27 policies**; app connects as non-owner `fourty_app` under FORCE RLS. `tests/tenant-isolation.test.ts` proves cross-tenant reads return zero rows via a direct connection. |
| 4 | Versioned **reversible migrations** + real-PG CI | **DONE** | 17 up/down pairs; `tests/migration-reversibility.test.ts` does up → checksum → down → re-apply and compares schema. CI provisions a dedicated reversibility DB. |
| 5 | Object-level **RBAC** + **field-level permissions** | **DONE** | `src/lib/permissions.ts` (`can()`), `authorize()` on every mutating route with a static guard in `tests/api-auth.test.ts`. Field permissions enforced by `redact()` on REST, **and** inside GraphQL resolvers and MCP tools — not only at one surface. |
| 6 | **Immutable audit log** | **DONE** | Enforced by the database, not by convention: `0004_audit_rls.sql` REVOKEs UPDATE/DELETE from `fourty_app` and adds `DO INSTEAD NOTHING` rules. |
| 7 | **Durable queue/worker** with retry, backoff, dead-lettering | **DONE** | pg-boss on Postgres; `src/worker/`; idempotency ledger `job_receipts` (ADR-004). |
| 8 | Custom fields & **no-code custom objects** | **DONE** | `custom_field_defs` / custom objects with CRUD over REST, GraphQL (`createRecord`/`updateRecord`/`deleteRecord`) and MCP (`list_records`/`create_record`). |
| 9 | Typed **GraphQL API** | **PARTIAL** | Real typed schema, RBAC per resolver, field-permission redaction, frozen SDL fixture. **Write surface is narrower than REST:** 11 mutations covering contacts, companies, custom records and facts — **no deal, task or note mutations**. "REST **and** GraphQL" is true for reads and partly true for writes. |
| 10 | Native **MCP server**, "**26 tools**, stdio + HTTP" | **DONE** | Exactly **26** tools counted in `src/mcp/tools.ts`; stdio (`src/mcp/stdio.ts`) + HTTP route. **Caveat:** no tool completes a task (`create_task`/`list_tasks` only). |
| 11 | Analytics — forecast, win rate, sales cycle, funnel, win/loss, sources, aging, stale deals | **DONE** | `src/lib/services/stats.ts`; `tests/deal-scoring.test.ts` + report routes. |
| 12 | Automatic 0–100 **lead scoring and deal health**, pure functions | **DONE** | `src/lib/scoring.ts` (7 tests), `deal-score` service (9 tests). Pure and tunable, as claimed. |
| 13 | Workflow automation — visual builder, **5 action types**, run history, durable queue | **DONE** | 5 actions counted (`create_task`, `add_note`, `update_field`, `webhook`, `log`); `workflow_runs` history; `tests/engine.test.ts`, `tests/workflow-evaluate.test.ts`. |
| 14 | Multi-currency, **12 currencies**, USD-normalised | **DONE** | 12 counted in `src/lib/currency.ts` (6 tests). |
| 15 | **Signed webhooks** | **DONE** | `src/lib/webhook-sign.ts`, `tests/webhook-signature.test.ts`; SSRF guard on the destination (`src/lib/net.ts`). |
| 16 | **2FA / TOTP** | **DONE** | `src/lib/totp.ts`, `tests/two-factor.test.ts`. |
| 17 | **SSO via OIDC** | **DONE** | `src/lib/sso/`, `/api/auth/sso/[id]`, `tests/sso.test.ts`, E2E covers add/edit/disable/delete. |
| 18 | **i18n + a11y** | **DONE** | `src/lib/i18n/` with locale files (9 tests); `tests/a11y.test.ts` (9) asserts skip link, landmarks, `aria-current`, named controls; E2E asserts accessible names on destructive controls. |
| 19 | Email/calendar ingestion, Google/Microsoft **mail OAuth** | **DONE** | `src/lib/sync/` — OAuth refresh + fetch + ingest; ICS for calendar. Matches the README's own carve-out that calendar is **not** over OAuth. |
| 20 | **`@fourty/twenty-migrate`** CLI | **DONE** | `packages/twenty-migrate`, `tests/twenty-migrate.test.ts` (7). |
| 21 | Optional in-app **AI assistant**, BYO-key, off by default | **DONE** *(understated — see below)* | `src/lib/ai/`; disabled without `AI_PROVIDER`. Stop-at-write: the model proposes, a human confirms. |
| 22 | Saved views, Kanban, PWA, ⌘K palette | **DONE** | `saved_views` + routes; kanban E2E drag test; `src/app/manifest.ts`; command palette with 2 E2E tests. |
| 23 | License **MIT** | **DONE** | `LICENSE`. |

## "Not done yet" claims — checked for honesty

A status note is only useful if its *negatives* are true too.

| README says not done | Verdict | Evidence |
|---|---|---|
| **SAML** | **CONFIRMED ABSENT** | No match for `saml` anywhere in `src/` or `packages/`. |
| **Apps / define-as-code SDK platform** | **CONFIRMED ABSENT** | No app manifest, registry or loader. ADR-016 records this as a deliberate **NO**. |
| **Calendar over OAuth** | **CONFIRMED ABSENT** | `pullAccount` fetches calendar only from an ICS feed URL; OAuth is used for mail. |

## Gaps and caveats found in this audit

| Area | Status | Evidence |
|---|---|---|
| **OAuth refresh tokens are stored in plaintext** | **CAVEAT — not claimed, worth knowing** | `sync_accounts.config` holds `refreshToken`/`accessToken` as JSON. There is **no encryption anywhere in `src/`**. `SECURITY.md` truthfully says sessions and API keys are hashed at rest — it says nothing about mailbox tokens, and neither did this file until now. Anyone with database read access holds the mailbox. |
| **GraphQL/MCP write parity with REST** | **PARTIAL** | The 2 skipped tests are here, and they are honest skips in `tests/surface-parity.test.ts`: no GraphQL task mutation, no MCP tool that completes a task. Deals and notes are also read-only over GraphQL. |
| **README understates the AI** | **DOC LAG** | Phases 0–4 of the agentic upgrade shipped: an evidence ledger that prices observations instead of trusting a confidence (ADR-018), a background work ledger, a keyless research pass that fills contact fields from your own mailbox **with no API key**, and a per-record agent panel. The README still describes only "an optional in-app chat". Nothing false — the page is simply behind the code. |
| **Field-permission redaction in the AI grounding block** | **KNOWN GAP** | `loadRecordContext` gates on object-level read and does not run `redact()` over the fields it puts in the prompt. Recorded in `plans/260808-2159-agentic-crm-upgrade/phase-04-*.md`. |
| **`npm run lint`** | **BROKEN** | No ESLint config; `next lint` drops into an interactive prompt and is deprecated in Next 16. Type checking via `npm run build` is what actually gates. |
| **Node requirement** | **IMPRECISE** | README says "Node.js 20+". Next 16 declares `>=20.9.0`, so 20.0–20.8 no longer work. CI and the Dockerfile both use Node 22. |
| **Dependency audit** | **CLEAN (high+)** | `npm audit --audit-level=high` exits 0 as of this commit. 4 moderate remain, all dev-only (`drizzle-kit` → `@esbuild-kit/esm-loader`). |

## Changes since the previous audit (`9de80c7`, 2026-07-07)

The last audit described a different program. Everything it listed as **MISSING**
now exists and is tested:

| Then | Now |
|---|---|
| SQLite, raw DDL, no migrations | Postgres 16, 17 reversible migrations, reversibility gate in CI |
| Multi-tenancy MISSING | RLS on every tenant table, 27 policies, isolation proven against the app role |
| RBAC MISSING | `can()` + `authorize()` + field permissions across REST, GraphQL and MCP |
| Audit log PARTIAL | Immutable at the database level (REVOKE + rules) |
| MCP server MISSING | 26 tools, stdio + HTTP |
| `@fourty/twenty-migrate` MISSING | Shipped, 7 tests |
| SSO / 2FA MISSING | OIDC + TOTP, both tested |
| Observability MISSING | pino structured logs, Prometheus metrics, OTel hooks |
| i18n / a11y UNVERIFIED | Both shipped and tested |
| 55 tests | **573** |

Two items from that audit are **still open** and are recorded honestly above:
GraphQL/MCP write parity, and `npm run lint`.

## Unresolved

- Should mailbox OAuth tokens be encrypted at rest before this is recommended
  for teams whose DB backups leave the host? The threat model is "database read
  access = mailbox access"; today that is accepted, undocumented in `SECURITY.md`,
  and cheap to fix with a KMS-less symmetric key from the environment.
- The README's AI section needs rewriting to match Phases 0–4, or the agentic
  work stays invisible to anyone who reads only the front page.
