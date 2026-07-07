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
| **B3 — RBAC + user mgmt + audit log** | ⏳ NEXT | membership roles exist; enforcement + invite + audit pending |
| **B4 — Workers/queue + rate limit + observability + backup drill** | ⬜ pending | plan: `docs/roadmap-b3-b4-b5.md` |
| **B5 — Benchmark vs Twenty (same Postgres)** | ⬜ pending | plan: `docs/roadmap-b3-b4-b5.md` |
| **B6 — twenty-migrate + MCP server + docs** | ⬜ pending | |

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

Known limits (honest): field-level permissions and RBAC *enforcement* are B3
(membership roles exist but aren't yet checked per-action). `settings` table is
global (unused by data routes). In-place B2 upgrade of a *populated* B1-Postgres
DB needs a manual backfill (fresh installs + migrate-from-sqlite handle it).

## Gate B3 — NEXT. Concrete plan
1. **RBAC enforcement**: a permission matrix (role × object × action) checked in a
   route-layer guard; `viewer` read-only, `member` CRM read/write, `admin` +settings/keys/members. Generated coverage test so a new route without a matrix entry fails CI (ADR-005).
2. **User management API + UI**: invite (email token) → membership, change role,
   remove member, deactivate; last admin cannot remove self.
3. **Audit log**: append-only table (actor/workspace/action/target/ts) on
   mutations + settings + auth; export; test that rows can't be updated/deleted.

**First command for the next session:** add a `permissions.ts` matrix + a
`requireRole()` guard, wire it into the mutating routes, and add
`tests/rbac-matrix.test.ts`.

## Environment note (for session continuity)
A real Postgres 16 is running locally in this container (`fourty` + `fourty_test`
DBs, roles `fourty` owner + `fourty_app` runtime for RLS). If the container was
recycled, re-provision: `pg_ctlcluster 16 main start` then recreate roles/DBs
(see the B2 setup) and `npm run db:migrate` for both DBs.

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
