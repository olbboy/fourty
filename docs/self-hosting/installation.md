# Installation

*Two supported paths: the bundled Docker Compose stack, or running against your own
Postgres from source.*

## Requirements

- **Docker + Compose** (Option A), or
- **Node.js 20+** and **Postgres 16** (Option B).

## Option A — Docker Compose (recommended)

```bash
git clone https://github.com/olbboy/fourty && cd fourty
cp .env.example .env
docker compose up --build      # → http://localhost:3000
```

Compose brings up Postgres, runs the migrations once, then starts **the app and a
background worker**. The worker drains webhook and workflow jobs from the
Postgres-backed queue ([pg-boss](../adr/004-queue-and-workers.md)) with retry, backoff,
and dead-lettering.

Edit `.env` before going beyond localhost — at minimum review the
[security settings](./configuration.md#security) and set strong database passwords.

## Option B — From source

Fourty uses a **two-role Postgres model** ([ADR-001](../adr/001-tenancy-model.md)): the
app connects as a **non-owner** role so Row-Level Security applies to it, while
migrations run as the **owner** role.

```bash
npm install

# App runtime — the NON-OWNER role, so RLS is enforced:
export DATABASE_URL=postgresql://fourty_app:fourty_app@localhost:5432/fourty
# Migrations + the queue's own schema — the OWNER role:
export MIGRATE_DATABASE_URL=postgresql://fourty:fourty@localhost:5432/fourty

npm run db:migrate      # apply the schema (runs as owner)
npm run build && npm start
```

Run the worker as a **separate process** so jobs execute off the request path:

```bash
npm run worker
```

> [!WARNING]
> In production, always run a worker. Without one, workflow actions and
> webhooks queue but never fire — unless you set `QUEUE_DRIVER=inline` (single-process
> only). See [Configuration → Queue](./configuration.md#queue-and-worker).

## Production topology

```
            ┌────────────┐        ┌──────────────┐
 clients ──▶│  app (web) │───────▶│              │
            └────────────┘        │  Postgres 16 │
            ┌────────────┐        │  (+ pgboss   │
   jobs ───▶│   worker   │───────▶│   schema)    │
            └────────────┘        └──────────────┘
```

One app process (scale horizontally behind a load balancer), one or more workers, one
Postgres. No Redis, no broker, no search cluster. Behind multiple replicas, front the
per-instance rate limiter with a shared gateway limiter — see
[Operations](./operations.md#rate-limiting).

## Next

- **[Configuration →](./configuration.md)** — every environment variable.
- **[Operations →](./operations.md)** — backups, metrics, security.
