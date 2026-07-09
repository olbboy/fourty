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
| [007](./007-custom-objects.md) | Custom objects: metadata-driven, no per-object DDL | Accepted |
| [008](./008-graphql-api.md) | Auto GraphQL API on the reference `graphql` package | Accepted |
| [009](./009-email-calendar-sync.md) | Email & calendar sync: engine in-repo, transport injectable | Accepted |
| [010](./010-mcp-server.md) | Native MCP server: hand-rolled stdio JSON-RPC | Accepted |
| [011](./011-field-level-permissions.md) | Field-level permissions: sparse rules + enforce helper | Accepted |
| [012](./012-two-factor-auth.md) | Two-factor auth: TOTP + backup codes on node:crypto | Accepted |
| [013](./013-webhook-signatures.md) | Signed webhooks: per-workspace HMAC-SHA256 | Accepted |
| [014](./014-sso-oidc.md) | SSO: OIDC Authorization Code + PKCE, injectable transport | Accepted |
| [015](./015-ai-native-strategy.md) | AI-native strategy: be the substrate for AI, not a Twenty clone | Accepted (T1+T2+T3 done) |

_Grounded via web research (Drizzle RLS docs, Postgres multi-tenancy patterns,
Twenty's architecture, pg-boss vs BullMQ). Sources cited inline._
