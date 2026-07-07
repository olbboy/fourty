# Architecture Decision Records

Fourty is undergoing a foundational shift (**Direction B**): from a
single-process, single-tenant SQLite app to a **Postgres multi-tenant** system
competing head-on with Twenty. These ADRs record the load-bearing decisions made
before the code. Each states the options, the trade-off, and the choice. They
are short by design.

| ADR | Title | Status |
|---|---|---|
| [001](./001-tenancy-model.md) | Tenancy model: shared-schema + RLS | Accepted |
| [002](./002-orm-and-migrations.md) | ORM & migrations: drizzle-kit versioned | Accepted |
| [003](./003-sqlite-fate.md) | Fate of SQLite: drop as prod, migrate tool | Accepted |
| [004](./004-queue-and-workers.md) | Queue & workers: pg-boss | Accepted |
| [005](./005-authz-model.md) | AuthZ: membership roles + scoped API keys | Accepted |
| [006](./006-connection-and-deploy.md) | Connection pooling & deploy topology | Accepted |

_Grounded via web research (Drizzle RLS docs, Postgres multi-tenancy patterns,
Twenty's architecture, pg-boss vs BullMQ). Sources cited inline._
