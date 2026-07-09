# Architecture

*One Next.js process, one Postgres, one background worker. A small, legible system —
and the decision records that explain every load-bearing choice.*

## The shape of it

```
src/
  app/            Next.js App Router — pages + REST API routes
  components/     UI primitives, charts, panels (no component library)
  db/             Drizzle (pg-core) schema, migrations, seed
  lib/
    scoring.ts      lead-score model (pure, tested)
    deal-scoring.ts deal health / win-likelihood (pure, tested)
    currency.ts     multi-currency conversion + formatting
    csv.ts          RFC-4180 parser/serializer (dependency-free)
    queue.ts        pg-boss job queue (enqueue, idempotency, drivers)
    ratelimit.ts    per-caller API rate limiter
    metrics.ts      Prometheus registry · logger.ts pino · otel.ts tracing hook
    workflows/      event → conditions → actions engine (pure core, tested)
    ai/             optional generative adapter (thin fetch, off by default)
    services/       stats aggregation, score recompute
  mcp/            MCP server (JSON-RPC) + stdio transport
  worker/         standalone job worker (npm run worker) + handlers
drizzle/          versioned SQL migrations (up + hand-written down)
scripts/          migrate-from-sqlite, backup-drill.sh, e2e-db-setup.sh
bench/            reproducible head-to-head benchmark harness (k6)
tests/            vitest — run against real Postgres in CI
```

## Load-bearing decisions

Every major choice is recorded as an [ADR](./adr/). The ones that shape the system most:

- **Postgres + Row-Level Security** for multi-tenancy — the app runs as a non-owner
  role so RLS can't be bypassed ([ADR-001](./adr/001-tenancy-model.md)).
- **drizzle-kit versioned, reversible migrations** — no runtime `CREATE TABLE`
  bootstrap ([ADR-002](./adr/002-orm-and-migrations.md)); SQLite dropped as a prod
  target ([ADR-003](./adr/003-sqlite-fate.md)).
- **pg-boss durable queue, no Redis** — the queue lives in Postgres itself
  ([ADR-004](./adr/004-queue-and-workers.md)).
- **Membership roles + scoped API keys** for AuthZ ([ADR-005](./adr/005-authz-model.md)),
  later refined with **field-level permissions** ([ADR-011](./adr/011-field-level-permissions.md)).
- **Metadata-driven custom objects** — no per-object DDL ([ADR-007](./adr/007-custom-objects.md)).
- **Auto GraphQL** on the reference `graphql` package ([ADR-008](./adr/008-graphql-api.md)).
- **Hand-rolled MCP server**, no SDK ([ADR-010](./adr/010-mcp-server.md)).
- **AI-native strategy** — be the substrate for AI, not a Twenty clone
  ([ADR-016](./adr/016-ai-native-strategy.md)).

## Design principles in the code

- **Pure cores, injectable edges.** Scoring, currency, CSV, the workflow engine, and the
  sync engine are pure functions with unit tests; transports (mail providers, AI
  endpoints) are pluggable adapters. This is why the same logic is testable and the same
  governance applies across REST, GraphQL, and MCP.
- **Dependency-light.** ~10 runtime dependencies. New capabilities lean on thin `fetch`
  calls over heavy SDKs.
- **No component library.** ~40 small Tailwind components — nothing to fork a theme from.
- **Nothing is done until it's tested.** The test suite runs against a real Postgres in
  CI, including a migration-reversibility check and Playwright E2E smoke tests.

## Read next

- **[Decision records (ADRs) →](./adr/)** — the full, cited rationale for each choice.
- **[Self-hosting →](./self-hosting/)** — run the system described here.
- **[Benchmarks →](../BENCHMARK.md)** — how it performs against Twenty.
