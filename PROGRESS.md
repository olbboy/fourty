# PROGRESS.md — Direction B (Postgres multi-tenant)

_Branch `claude/fourty-production-readiness-8q6wyl`. Last updated 2026-07-07._

**Product decision (locked): Direction B.** Fourty is moving off single-tenant
SQLite to **Postgres multi-tenant with RLS** to compete head-on with Twenty. The
"30-second SQLite deploy" advantage is deliberately traded for scale and
enterprise-readiness (see `docs/adr/`).

## Anti-vanity rule
Nothing below is "done" without a passing test or a command actually run. No
benchmark numbers are published because none were measured yet.

## Gate status

| Gate | State | Evidence |
|---|---|---|
| **RULE #0 — ADRs** | ✅ DONE | `docs/adr/001..006` — tenancy(RLS), migrations, SQLite fate, queue, authz, deploy |
| **B1 — Postgres foundation & migrations** | ✅ DONE | see below |
| **B2 — Multi-tenancy + RLS + isolation suite** | ✅ DONE | `tests/tenant-isolation.test.ts` (6) — see below |
| **B3 — RBAC + user mgmt + audit log** | ✅ DONE | `rbac-matrix.test.ts`, `audit-log.test.ts`, `members.test.ts`, `permissions.test.ts` — see below |
| **B4 — Workers/queue + rate limit + observability + backup drill** | ✅ DONE | `worker.test.ts`, `ratelimit.test.ts`, `metrics.test.ts` + backup-drill log — see below |
| **B5 — Benchmark vs Twenty (same Postgres)** | ✅ DONE | `BENCHMARK.md` + `bench/results/*.json` — real head-to-head @10k, both stacks measured — see below |
| **C1 — Custom objects (no-code)** | ✅ DONE | `tests/custom-objects.test.ts`; migration `0006` reversible; REST + records validated on write (ADR-007) |
| **C2 — Auto GraphQL API** | ✅ DONE | `tests/graphql.test.ts`; `/api/graphql`, typed queries all objects + mutations, RLS+RBAC (ADR-008) |
| **C3 — Saved views (API + UI)** | ✅ DONE | `tests/saved-views.test.ts`; `/api/saved-views`, personal/shared, wired into contacts list |
| **C4 — i18n** | ✅ DONE | `tests/i18n.test.ts`; en/vi catalogs, `t()`, locale resolution, language switcher |
| **C5 — a11y pass** | ✅ DONE | `tests/a11y.test.ts`; dialogs/combobox/landmarks/labels; `next build` green |
| **C6 — Email/calendar sync** | ✅ DONE | `tests/sync.test.ts`; migration `0007`; parse→match→link→dedupe engine, injectable transport (ADR-009) |
| **B6 — twenty-migrate + MCP server + docs** | ✅ DONE | `tests/twenty-migrate.test.ts`, `tests/mcp.test.ts`; `@fourty/twenty-migrate` pkg, `npm run mcp` (ADR-010); docs updated |

> **Detailed executable plans for B3, B4, B5** (tasks, files, migrations, tests,
> acceptance criteria) live in [`docs/roadmap-b3-b4-b5.md`](./docs/roadmap-b3-b4-b5.md).

## Gate B1 — DONE (evidence)

| Requirement | Status | Evidence |
|---|---|---|
| Schema on Postgres via drizzle-kit; no runtime `CREATE TABLE IF NOT EXISTS` | ✅ | `src/db/schema.ts` (pg-core), `drizzle/0000_init.sql`, `src/db/index.ts` (node-postgres Pool) |
| Migrations versioned, up/down reversible, tested | ✅ | `drizzle/down/0000_init.down.sql` + `tests/migration-reversibility.test.ts` (apply→checksum→rollback→re-apply, identical checksum) |
| CI runs tests on a real Postgres service container | ✅ | `.github/workflows/ci.yml` (postgres:16 service; tsc + db:migrate + test + build). Runs on push; the exact commands pass locally on Postgres 16. |
| 55 legacy tests pass on Postgres (not emulated) | ✅ | `tests/pg-setup.ts` (migrate+truncate on real PG); **60/60 tests pass** now (55 ported + 4 migrate round-trip + 1 reversibility) |
| `migrate-from-sqlite` tool with round-trip test | ✅ | `scripts/migrate-from-sqlite.ts` + `tests/migrate-from-sqlite.test.ts` (dry-run, counts, field/type preservation, idempotent re-run) |
| Docker Compose one-command up + healthcheck + graceful shutdown + `.env.example` | ✅ (authored) | `docker-compose.yml` (postgres + migrate one-shot + app), `/api/health`, `Dockerfile`, `.env.example`. **Not run here** — no Docker daemon in the dev container; instead the production build was booted with `next start` against Postgres and served health/login/contacts/stats/search end-to-end (ilike case-insensitive parity confirmed). |

**Full E2E proof (live, on Postgres):** `GET /api/health → {"status":"ok"}`;
unauthenticated `/api/contacts → 401`; `POST /api/auth/login` (demo) → 200 +
cookie; authenticated contacts/stats/search all return real data;
`?q=maya` matched "Maya Chen" (ilike parity).

### What changed in B1
Faithful SQLite→Postgres port preserving value semantics (epoch-millis→bigint
number-mode, 0/1 flags→integer, JSON→text), so app logic is unchanged. Full
sync→async conversion of all 24 API routes + libs (drizzle better-sqlite3 is
sync; node-postgres is async). `like()`→`ilike()` for case-insensitive search
parity. `better-sqlite3` demoted to devDependencies (migrate-tool-only).

## Gate B2 — DONE (evidence)

| Requirement | Status | Evidence |
|---|---|---|
| `workspace` + `workspace_member` tables; role on membership | ✅ | `src/db/schema.ts`, migration `0001_workspaces` |
| `workspace_id NOT NULL` on every CRM table (13), composite indexes | ✅ | `0001_workspaces.sql` (DEFAULT `current_setting('app.workspace_id')` → fail-closed inserts) |
| Postgres RLS ENABLE + **FORCE** + policies; non-owner app role + grants | ✅ | `0002_rls.sql` (hand-written); app connects as `fourty_app`, migrations as owner `fourty` |
| App-layer scoping via a single choke point (no per-query edits, no bypass) | ✅ | `withWorkspace()` + AsyncLocalStorage proxy in `src/db/index.ts`; `withAuth()` wraps all 24 data routes; static guard test |
| Auth carries workspace (API key → its ws; session → active ws); signup/login | ✅ | `src/lib/auth.ts`, `src/lib/api.ts`, `auth/setup`, `auth/login` |
| **Isolation attack suite 100% pass** (cross-tenant REST → 404; key confined; RLS proof) | ✅ | `tests/tenant-isolation.test.ts` (6 tests) |
| Migrations reversible incl. tenancy/RLS (full-chain up→down→up) | ✅ | `drizzle/down/0001,0002` + `tests/migration-reversibility.test.ts` |
| migrate-from-sqlite lands data into a workspace (round-trip) | ✅ | `scripts/migrate-from-sqlite.ts` + `tests/migrate-from-sqlite.test.ts` |

**Live E2E:** setup creates a workspace; contacts/stats/search scoped to it as
`fourty_app`; API key confined to its workspace; bad key → 401. **66/66 tests
pass on real Postgres + RLS.**

Design note (why it's safe): RLS is defense-in-depth. Even if a route forgot to
scope a query, `fourty_app` + RLS returns zero rows (fail closed) rather than
leaking. The isolation suite includes a direct-connection proof independent of
app code.

Known limits (honest): field-level permissions are still absent (B3 does
object-level RBAC only). In-place B2/B3 upgrade of a *populated* B1-Postgres DB
needs a manual backfill (fresh installs + migrate-from-sqlite handle it).

## Gate B3 — DONE (evidence)

| Requirement | Status | Evidence |
|---|---|---|
| Permission matrix (role × object × action), pure + tested | ✅ | `src/lib/permissions.ts` (`can()`); `tests/permissions.test.ts` (admin all / member CRM-write / viewer read-only / default-deny) |
| RBAC enforced on every mutating route + static coverage guard | ✅ | `authorize()` in `src/lib/api.ts` (role from `workspace_members`/API-key `role`); wired into all mutating handlers; `tests/api-auth.test.ts` static guard fails CI if a mutating route omits `authorize(`; `tests/rbac-matrix.test.ts` drives real handlers per role |
| User management (invite → accept/signup, list, change role, deactivate) | ✅ | `/api/members`, `/api/members/invite`, `/api/members/accept`, `/api/members/[userId]`; **last active admin can't be demoted/removed**; `tests/members.test.ts`; Settings → Team members UI |
| Immutable audit log | ✅ | `audit_log` table + `src/lib/audit.ts`; `0004_audit_rls` RLS + `REVOKE UPDATE,DELETE` + `DO INSTEAD NOTHING` rules; `/api/audit` (admin, +CSV); `tests/audit-log.test.ts` proves a mutation logs and rows can't be rewritten/removed |
| `settings` scoped per workspace | ✅ | `settings` now `(workspace_id, key)` PK + RLS (`0003`/`0004`) |
| Migrations reversible incl. B3 | ✅ | `0003_rbac_members_audit` + `0004_audit_rls` (+ downs); `tests/migration-reversibility.test.ts` full chain 0000→0004 (20 tables / 15 policies) |

**Verification (this session, real Postgres 16 in Docker):** `npx vitest run` →
**84/84 pass**; `tsc` green. Live E2E on `next dev` (app as `fourty_app`): admin
setup → invite → **accept signs up a new user + joins as member** → member
creates a contact (201) but is denied members/api-keys (403) → admin demotes to
viewer → viewer create is denied (403) → audit log shows
`member.invited/joined/role_changed` + `contact.created`, immutable.

### Deliberate choices / deviations
- **RBAC role source**: sessions resolve role from `workspace_members`
  (deactivated members are denied); API keys carry a `role` column (default
  `admin` for back-compat, selectable on create).
- **Invite tokens** are `${workspaceId}.${secret}` so `accept` resolves the
  workspace without a cross-tenant scan; `accept` also signs up a brand-new
  invitee (the token authorizes it) since there is no open registration.
- **audit_log immutability** is enforced two ways: `REVOKE UPDATE,DELETE` from the
  app role AND rewrite rules, so neither the app nor a stray query can alter it.

## Gate B4 — DONE (evidence)

| Requirement | Status | Evidence |
|---|---|---|
| Queue + worker (pg-boss, no Redis) | ✅ | `src/lib/queue.ts` (typed `enqueue`, `inline`/`pgboss` drivers, own `pgboss` schema as owner), `src/worker/{handlers,index}.ts` (`npm run worker`), Compose `worker` service |
| Heavy work off the request path | ✅ | webhook delivery + workflow dispatch now `enqueue()` instead of running in-request (`engine.ts`); worker runs them inside `withWorkspace()` (RLS + audit hold), retry + exponential backoff + dead-letter (`<name>.dead`) |
| Exactly-once under at-least-once delivery | ✅ | `job_receipts` idempotency ledger (migration `0005_queue`, RLS) claimed transactionally before side effects; **worker-kill test**: enqueue 12, `SIGKILL` mid-run, restart → receipts == 12 exactly (`tests/worker.test.ts`) |
| Rate limiting on the whole API surface | ✅ | `apiRateLimit()` wired into `withAuth` — keyed by caller+IP+route class (read/write/bulk), `RateLimit-*` + `Retry-After` headers; `tests/ratelimit.test.ts` (burst→429, IP buckets, window reset) |
| Observability: structured logs + `/metrics` | ✅ | `pino` request-scoped child logger (request_id + workspace_id via the ALS store); `GET /metrics` Prometheus (HTTP counter + latency histogram, DB-pool gauges, queue depth), public + PII-free; `tests/metrics.test.ts` |
| Optional OTel tracing hook | ✅ | `src/lib/otel.ts` + `src/instrumentation.ts` — no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` set (+ OTel SDK installed) |
| Backup/restore drill (real) | ✅ | `scripts/backup-drill.sh` — pg_dump → per-table count → restore into a fresh DB → re-count → PASS/FAIL. **Ran locally: PASS, all 21 tables identical** (503 contacts / 121 companies / 301 activities incl.) |
| Zero-downtime expand-migration demo | ⚠️ authored | `bench/zero-downtime.k6.js` (k6, `http_req_failed rate==0` threshold). **Not run here** — k6 not installed in this env; documented manual/CI run |
| Migrations reversible incl. B4 | ✅ | `0005_queue` (+ down); `tests/migration-reversibility.test.ts` full chain 0000→0005 (21 tables / 16 policies) |

**Verification (this session, real Postgres 16):** `npx vitest run` → **94/94 pass**;
`tsc` green; `npm run build` green (incl. `/api/metrics`). **Live E2E** (`next start`
as `fourty_app`, `QUEUE_DRIVER=pgboss`): `/api/health → ok`; unauth `/api/contacts
→ 401`; auth → 200 with `RateLimit-Limit: 600 / Remaining: 599 / Reset: 60`;
`/metrics` exposed the 200+401 counters, latency histogram and DB-pool gauges
(no PII); a `POST /api/contacts` enqueued a `workflow.dispatch` job to `pgboss.job`.
Backup drill: PASS.

### Deliberate choices / deviations
- **pg-boss connects as the owner role** (`QUEUE_DATABASE_URL`) since it manages
  its own `pgboss` schema DDL. That pool only touches `pgboss`; all tenant data
  still flows through the `fourty_app` pool under RLS, and handlers re-enter
  `withWorkspace()` — isolation + audit hold end-to-end.
- **Inline driver** (default under tests / single-process dev) runs jobs in the
  caller's request context — preserves pre-B4 synchronous semantics so existing
  tests stay green; `pgboss` is the production default.
- **Graceful degradation:** if the queue is unreachable (misconfigured / no
  worker), `enqueue()` falls back to inline execution (logged) so a request never
  500s and no job is lost — durability is the only thing traded.
- **Exactly-once is on the transactional (DB) side effect** via `job_receipts`.
  External webhook POSTs are at-least-once by nature (a job killed after the POST
  but before commit is redelivered) — stated honestly, asserted as such in the test.
- **In-process rate limiter / metrics** measure ONE instance (like the existing
  limiter). Behind multiple replicas, front with a shared limiter and scrape each
  instance — documented, not hidden.

## Gate B5 — DONE (evidence)

| Requirement | Status | Evidence |
|---|---|---|
| One-command reproducible harness | ✅ | `bench/run.sh` (up-from-clean → bootstrap → seed → k6 matrix → resource sample → regenerate tables); `bench/docker-compose.bench.yml` (both stacks on `postgres:16`, matched 4cpu/4g DB + app, 2cpu/2g worker, same PG tuning, `profiles` for isolation) |
| Seed via each product's API | ✅ | `bench/seed.ts` — Fourty REST, Twenty GraphQL (verified against v2.18); `bench/twenty-bootstrap.mjs` does Twenty's real signup→new-workspace→activate→re-auth token flow. Same shape: companies=SIZE/10, contacts=SIZE, deals=SIZE/2 (activities Fourty-only) |
| API load: p50/p95/p99 + throughput | ✅ | `bench/k6/{api,twenty}.js` — REST both sides, list/filter/sort/search/create/update, warm-up + fixed VUs/duration |
| Numbers come only from measurements | ✅ | `bench/report.ts` renders `BENCHMARK.md` straight from `bench/results/*.json`; observations + win/loss + footprint are all derived from the data, never hand-typed |
| **Head-to-head @10k, both stacks (real)** | ✅ | 0 errors both sides. **Fourty wins every scenario**: list 756 vs 191 rps (p95 35 vs 136ms), sort 868 vs 185, search 639 vs 325, create 689 vs 287, update 626 vs 364; filter closest (998 vs 819). Ingest 697 vs 429 rows/s. **Footprint ~830 MiB vs ~3047 MiB (3.7×)** — Twenty's Redis+worker+richer server. See `BENCHMARK.md` |
| Losses published, not hidden | ✅ | Fourty lost no scenario at 10k; the report auto-lists any loss with an optimization note. Caveat stated: same REST protocol + dataset shape; Twenty does more per request (richer model, GraphQL-first); one host, one run |
| Zero-downtime expand-migration demo | ⚠️ authored | `bench/zero-downtime.k6.js` (Gate B4) — k6 available now but this specific drill not re-run here |

**Honest scope note:** measured at **10k** (per session scope). 100k/1M are supported
by the same harness (`SIZE=100000 bench/run.sh {fourty,twenty}`) but not yet run —
Twenty's prior hypothesised concurrency/bulk edge is to be *measured* at larger N,
not assumed. Numbers are one host, one run; re-run for stability.

## Tier-2 (C1–C6) + B6 — DONE (evidence)

Verified 2026-07-08 on real Postgres 16: `npx vitest run` → **142/142 pass**;
`tsc` green (root + `packages/twenty-migrate`); `next build` green (all new routes
registered). Every gate ships a reversible migration where it adds tables
(`0006`, `0007`) and cross-workspace RLS confinement is asserted per feature.

| Gate | What shipped | Key files | Test |
|---|---|---|---|
| C1 | No-code custom objects: definitions, fields, JSON records; records validated/coerced on write | `src/db/schema.ts`, `drizzle/0006`, `src/lib/{records,custom-objects}.ts`, `src/app/api/{custom-objects,objects}/**` | `custom-objects.test.ts` |
| C2 | Typed GraphQL for every object + custom records; RLS + per-resolver RBAC | `src/lib/graphql/schema.ts`, `src/app/api/graphql/route.ts` | `graphql.test.ts` |
| C3 | Saved views (personal/shared) API + contacts-list UI bar | `src/app/api/saved-views/**`, `src/components/saved-views.tsx` | `saved-views.test.ts` |
| C4 | i18n: en/vi catalogs, `t()` + interpolation, cookie/Accept-Language resolution, switcher | `src/lib/i18n/**`, `src/app/api/locale/route.ts` | `i18n.test.ts` |
| C5 | a11y: dialog/combobox/listbox semantics, modal focus mgmt, `<label>` association, skip link, aria-current, decorative icons hidden | `src/components/{command-palette,ui,shell,icons,saved-views}.tsx` | `a11y.test.ts` |
| C6 | Email/calendar ingestion: RFC822 + ICS parsers, contact matching, idempotent dedupe, activity linking; injectable transport | `drizzle/0007`, `src/lib/sync/**`, `src/app/api/sync/**` | `sync.test.ts` |
| B6·migrate | `@fourty/twenty-migrate` CLI: pure transforms + id-remapping over injectable Twenty/Fourty clients, `--dry-run` | `packages/twenty-migrate/**` | `twenty-migrate.test.ts` |
| B6·mcp | Native MCP server (stdio JSON-RPC, 10 tools) reusing RLS + RBAC; `npm run mcp` | `src/mcp/**` | `mcp.test.ts` (+ live stdio smoke) |
| B6·docs | ADR-007..010, PARITY/PROGRESS/README refresh, `public/llms.txt` | `docs/adr/00{7,8,9,10}-*.md`, `public/llms.txt` | — |

### Deliberate choices / deviations
- **Custom objects are metadata-driven** (one JSON `custom_records` table) — no
  per-object DDL, so the feature is one reversible migration and RLS-safe (ADR-007).
  Trade-off: no per-field SQL indexes on custom data at this tier.
- **GraphQL mutations** cover contacts/companies/custom records; deals/tasks/notes
  are read via GraphQL but written via REST where their side effects live (ADR-008).
- **Email/calendar**: the parse→match→link→dedupe engine is in-repo and fully
  tested; the OAuth/IMAP network transport is the injectable edge and is **not**
  exercised by tests — stated, not mocked green (ADR-009).
- **MCP + migrate CLI** hand-rolled with zero new heavy deps (only `graphql` was
  added, for C2), consistent with the pg-boss/no-Redis ethos.

## Environment note (for session continuity)
Local dev (macOS) runs Postgres 16 in Docker:
`docker run -d --name fourty-pg -e POSTGRES_USER=fourty -e POSTGRES_PASSWORD=fourty -e POSTGRES_DB=fourty -p 5432:5432 postgres:16`.
Then create DBs `fourty_test` and `fourty_revtest`, and the runtime role
`CREATE ROLE fourty_app LOGIN PASSWORD 'fourty_app'` (0002/0004 apply its grants).
Env: `DATABASE_URL` = `fourty_app` (RLS-subject app role); `MIGRATE_DATABASE_URL`
= owner `fourty`. Run `npm run db:migrate` for each DB.

## Risks / trade-offs (unchanged, restated)
- **SQLite retired** as prod runtime; existing users migrate via
  `migrate-from-sqlite` (round-trip tested). This is the deliberate cost of B.
- **RLS + pooling:** `SET LOCAL` per transaction is PgBouncer-transaction-safe
  (ADR-006); every query must run inside such a transaction — enforced by the
  repository layer in B2.
- **License:** MIT (vs Twenty AGPL) — permissive, resellable; forfeits copyleft.
  A conscious product choice.

## Evidence index
- ADRs: `docs/adr/`. Tests: `npx vitest run` → 60 passing on Postgres.
- Migrate tool: `scripts/migrate-from-sqlite.ts`. Deploy: `docker-compose.yml`.
- Audit/competitive: `CLAIMS.md`, `PARITY.md`.
