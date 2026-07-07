# ADR-003 — Fate of SQLite

**Status:** Accepted · **Date:** 2026-07-07

## Context
Direction B trades the "30-second SQLite deploy" for Postgres scale and
multi-tenancy. Existing self-hosters have real data in `fourty.db`. Their data is
**inviolable** — we may not strand it.

## Options
1. **Drop SQLite as a production target; ship a one-way `migrate-from-sqlite`
   tool** (round-trip tested) to move existing users to Postgres.
2. **Dual-driver runtime** (support both SQLite and Postgres in the app via a
   driver abstraction).

## Decision
**Option 1 — drop SQLite as production runtime; provide a tested migrate tool.**

- The app runtime targets **Postgres only**. No runtime driver switch.
- `better-sqlite3` is retained **only** as a dependency of the migrate tool
  (`scripts/migrate-from-sqlite.ts`), which *reads* an old `fourty.db` and
  *writes* Postgres. It is not on the app's hot path.
- Acceptance: a **round-trip test** — seed a SQLite DB → run the tool → assert
  per-table row counts match and spot-check field values — must pass before we
  can claim SQLite is safely retired.

## Rationale
Dual-driver is a permanent tax: every query must satisfy two dialects
(SQLite has no RLS, different types, sync vs async), which kills exactly the
Postgres-specific power (RLS, JSONB, concurrency) Direction B exists to gain.
The mission is explicit: no half-measures. A one-time migration tool costs far
less than perpetual dual-dialect maintenance.

## Trade-offs
- Self-hosters must run a migration step and stand up Postgres — a real cost we
  document in the migration guide. This is the deliberate price of Direction B.
- We keep `better-sqlite3` in `devDependencies`/tool scope only, so the app image
  doesn't carry it.
