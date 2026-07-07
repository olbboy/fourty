# ADR-001 — Tenancy model

**Status:** Accepted · **Date:** 2026-07-07 · Supersedes the single-tenant SQLite model.

## Context
Fourty must isolate data between independent workspaces (tenants) with a
guarantee strong enough for production PII. A missing `WHERE workspace_id = ?` in
any one query must not be able to leak data across tenants.

## Options
1. **Shared database, shared schema + `workspace_id` column + Postgres RLS**
   (defense-in-depth). One set of tables; every CRM row carries `workspace_id`;
   RLS policies enforce isolation at the DB engine even if the app forgets a
   filter.
2. **Schema-per-tenant** (Twenty's approach [3]): a Postgres schema per
   workspace, tables cloned per tenant. Strong isolation; enables per-tenant
   dynamic DDL (Twenty needs this for user-created custom *objects*).
3. **Database-per-tenant**: maximal isolation, unmanageable migrations/backups
   at scale [2].

## Decision
**Option 1 — shared-schema + `workspace_id` + RLS.**

- Every CRM table gets `workspace_id uuid NOT NULL` + FK to `workspace` +
  composite indexes `(workspace_id, …)` on hot query paths.
- **Two enforcement layers:**
  1. *Application:* all DB access goes through a repository/helper that takes
     `workspaceId` from the authenticated context; a static test forbids `db.`
     usage outside that layer (no bypass path).
  2. *Database:* `ENABLE ROW LEVEL SECURITY` **+ `FORCE ROW LEVEL SECURITY`** on
     every CRM table, with a policy `USING (workspace_id = current_setting('app.workspace_id')::uuid)`.
     The app sets `SET LOCAL app.workspace_id = '<id>'` inside each request's
     transaction [1]. A bug in layer 1 is caught by layer 2.
- **Role split so RLS actually applies:** tables are owned by a migration role
  (`fourty`); the app connects as a **non-owner, non-superuser** role
  (`fourty_app`). Superusers and table owners bypass RLS — `FORCE RLS` closes the
  owner gap, and the app never connects as superuser.

## Trade-offs / limits (stated honestly)
- **Noisy-neighbor:** one shared DB; a huge tenant can affect others. Acceptable
  for SMB→mid-market; revisit with per-tenant DBs for whales later.
- **No per-tenant DDL:** we cannot give each workspace its own physical columns.
  Fourty models custom fields as JSON (`custom` column) + `custom_field_defs`,
  not per-tenant DDL — so we don't need schema-per-tenant. If Fourty later wants
  Twenty-style custom *objects* with native columns, this decision must be
  revisited (that's the main reason Twenty chose schema-per-tenant).
- **RLS + connection pooling:** `SET LOCAL` is transaction-scoped, so it is safe
  under PgBouncer transaction pooling [1]. Every read/write must run inside a
  transaction that sets the variable first — enforced in the repository layer.

## Consequences
- B2 introduces `workspace`, `workspace_member`, and `workspace_id` everywhere.
- The isolation attack suite (cross-tenant REST/API-key/webhook access → all
  403/404, plus a direct-connection RLS proof) is the acceptance test for B2.

### Sources
1. Drizzle RLS docs + `SET LOCAL`/`current_setting` pattern. https://orm.drizzle.team/docs/rls · https://neon.com/docs/guides/rls-drizzle
2. Multi-tenant DB patterns (shared/schema/db-per-tenant trade-offs). https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/
3. Twenty multi-workspace / self-host. https://docs.twenty.com/developers/self-host/capabilities/setup
