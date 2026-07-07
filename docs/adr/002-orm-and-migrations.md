# ADR-002 — ORM & migrations

**Status:** Accepted · **Date:** 2026-07-07

## Context
The SQLite app had **no migrations** — it ran `CREATE TABLE IF NOT EXISTS` at
boot, which silently fails to evolve existing databases (a latent upgrade bug
noted in `CLAIMS.md`). Postgres production needs versioned, reversible schema
changes runnable in CI and in zero-downtime deploys.

## Options
1. **drizzle-orm (pg-core) + drizzle-kit migrations.** We already use drizzle;
   `drizzle-kit generate` produces SQL migration files from the schema, applied
   with a runner. Hand-written SQL migrations are also supported for things
   drizzle-kit can't express (RLS policies, `FORCE RLS`, functions).
2. **Prisma / TypeORM.** Would mean replacing the ORM wholesale — throwing away
   working query code and the type-safe schema for no tenancy benefit.
3. **Raw SQL + a bespoke migrator.** Full control, more maintenance.

## Decision
**Option 1.** Keep drizzle; adopt **drizzle-kit** for versioned migrations.

- Schema in `src/db/schema.ts` (pg-core). `drizzle.config.ts` points at it.
- Migrations live in `drizzle/` as ordered SQL files under version control.
- **RLS policies, `FORCE ROW LEVEL SECURITY`, and grants** that drizzle-kit
  doesn't model are added as **hand-written SQL migration files** in the same
  ordered sequence (they run in order alongside generated ones).
- A migration test applies all → rolls back one → re-applies and compares the
  resulting schema (via `pg_dump --schema-only` checksum).
- **Zero-downtime = expand → migrate → contract:** add nullable column/new table
  (expand, backward-compatible) → backfill + dual-write → switch reads → drop old
  (contract) in a later release. Never a destructive change in the same deploy
  that ships the code depending on it.

## Trade-offs
- drizzle-kit down-migrations are less first-class than up; we keep explicit
  `down.sql` where reversibility matters and test it (B1 acceptance).
- No `CREATE TABLE IF NOT EXISTS` at runtime anymore — the app assumes the schema
  is already migrated (migrations run as a deploy/CI step, and via the worker's
  entrypoint in Compose).

## Consequences
- CI gains a Postgres service container; the existing 55 tests run against real
  Postgres, not SQLite `:memory:`.
