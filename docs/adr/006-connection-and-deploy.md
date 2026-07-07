# ADR-006 — Connection pooling & deploy topology

**Status:** Accepted · **Date:** 2026-07-07

## Context
Postgres over TCP means connection management matters, and RLS (ADR-001) requires
a per-request transaction that sets `app.workspace_id`. The deploy story changes
from "one Node process" to a small multi-service stack.

## Decision

### Connections
- **node-postgres `Pool`** in the app and worker. `int8` (epoch-millis and
  future bigints) parsed to JS `number` via a global type parser (values are
  < 2^53, so no precision loss) — preserves the existing `Date.now()` semantics
  through the port.
- **Per-request transaction** wraps every unit of work: `BEGIN; SET LOCAL
  app.workspace_id = $1; … ; COMMIT`. `SET LOCAL` is transaction-scoped, so it is
  **PgBouncer transaction-mode safe** — no leakage of one request's tenant id to
  the next connection user.
- **PgBouncer** (transaction pooling) is supported and recommended for scale but
  optional in the base Compose (app talks to Postgres directly for simplicity;
  swap the DSN to point at PgBouncer without code changes).

### Deploy topology (Docker Compose, one command)
```
services:
  postgres  – data + pg-boss queue (named volume, healthcheck)
  migrate   – one-shot: runs drizzle migrations + RLS/grants, then exits
  app       – Next.js server (depends_on migrate: completed, postgres: healthy)
  worker    – pg-boss consumer (workflows, webhooks, future sync)
```
- **Healthchecks:** Postgres `pg_isready`; app `/api/health` (DB ping).
- **Graceful shutdown:** app/worker trap SIGTERM, stop accepting work, drain
  in-flight, close the pool.
- No Redis (ADR-004). `.env.example` carries `DATABASE_URL`, `APP_DATABASE_URL`
  (app role), pool sizes, and feature flags.

## Trade-offs
- More services than the old single process — the deliberate cost of Direction B.
  Mitigated by "one `docker compose up`", healthchecks, and a migrate one-shot so
  boot ordering is deterministic.
- Direct-to-Postgres (no PgBouncer) in the base stack caps concurrent connections
  at the pool size; documented, and the DSN indirection makes adding PgBouncer a
  config change, not a code change.
