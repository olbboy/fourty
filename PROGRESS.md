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
