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
| **B2 — Multi-tenancy + RLS + isolation suite** | ⏳ NEXT | not started — the point of no return |
| **B3 — RBAC + user mgmt + audit log** | ⬜ pending | |
| **B4 — Workers/queue + rate limit + observability + backup drill** | ⬜ pending | |
| **B5 — Benchmark vs Twenty (same Postgres)** | ⬜ pending | |
| **B6 — twenty-migrate + MCP server + docs** | ⬜ pending | |

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

## Gate B2 — NEXT (the point of no return). Concrete plan

Do these in order; do not merge until the isolation suite is 100% green.

1. **Schema migration** (new drizzle migration `0001_workspaces`):
   - `workspace(id, name, slug, created_at)`.
   - `workspace_member(workspace_id, user_id, role)` — role ∈ admin/member/viewer (ADR-005).
   - Add `workspace_id text NOT NULL` (FK → workspace) to every CRM table:
     companies, contacts, pipelines, stages, deals, tasks, notes, activities,
     custom_field_defs, workflows, workflow_runs, api_keys, saved_views.
     Add composite indexes `(workspace_id, …)` on hot paths.
   - Backfill: create a default workspace, set all existing rows to it (expand→migrate; safe for the migrate-from-sqlite path too).
2. **RLS migration** (hand-written SQL, `0002_rls`):
   - `ALTER TABLE … ENABLE ROW LEVEL SECURITY; ALTER TABLE … FORCE ROW LEVEL SECURITY;`
   - Policy per table: `USING (workspace_id = current_setting('app.workspace_id', true)::uuid)` (uuid or text to match id type).
   - Grants: `fourty_app` gets DML but NOT ownership; owner stays `fourty`.
3. **Connection/repository layer**: a `withWorkspace(workspaceId, fn)` helper that
   opens a transaction, runs `SET LOCAL app.workspace_id = $1`, and passes a tx
   handle. Route the app runtime connection through the `fourty_app` role
   (`APP_DATABASE_URL`). Every route uses this — add a static test forbidding raw
   `db.` outside the repository layer.
4. **Auth scoping**: session + API key carry `workspace_id`; `authenticate()`
   returns the active workspace; signup creates a workspace; invite adds a member.
5. **Isolation attack suite** (`tests/tenant-isolation.test.ts`) — DEFINITION OF
   DONE for B2: two workspaces + users + API keys; assert cross-tenant
   REST get/list/update/delete by foreign id → 404/403; API key A cannot read B;
   webhook/workflow/attachment scoped; **plus** a direct-connection RLS proof
   (query as `fourty_app` with a wrong `app.workspace_id` → 0 rows).

**First command for the next session:**
`DATABASE_URL=postgresql://fourty:fourty@localhost:5432/fourty npx drizzle-kit generate --name workspaces` after adding the workspace tables + `workspace_id` columns to `src/db/schema.ts`.

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
