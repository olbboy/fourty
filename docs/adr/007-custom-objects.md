# ADR-007 — Custom objects (no-code)

**Status:** Accepted · **Date:** 2026-07-08

## Context
Twenty lets a workspace define its own object types from Settings, with no code
and no schema migration. Fourty had custom *fields* on three fixed objects only.
To close the "custom objects" parity gap we need user-defined object types whose
records are still tenant-isolated (RLS) and reversible in one migration.

## Decision
**Metadata-driven, single generic records table — no per-object DDL.**

- `custom_objects` — one row per user-defined type (`api_name`, singular/plural
  labels, icon). `api_name` is unique per workspace and cannot collide with a
  built-in object.
- `custom_object_fields` — the field schema for an object (key, label, type,
  options, required, order). Same field types as custom fields.
- `custom_records` — **one row per record**, values in a JSON `data` column, keyed
  by `object_id`.

All three are workspace-scoped with the standard RLS policy, so a record inherits
tenant isolation for free and the whole feature ships in one reversible migration
(`0006`). Records are **validated + coerced against the field defs on write**
(`src/lib/records.ts`), which also gives Fourty write-time validation for
user-defined schema — something the fixed-object custom fields lacked.

### Why not per-object tables (dynamic DDL)?
DDL at runtime under RLS is dangerous (grants, policy creation, migration drift)
and hard to make reversible or PgBouncer-safe. Twenty runs a metadata layer over
dynamic tables; Fourty's "small, legible" ethos favors one JSON-valued table.
The trade-off — no per-field SQL indexes on custom data — is acceptable at Fourty's
target scale and can be revisited with expression/GIN indexes later.

## Consequences
- REST (`/api/custom-objects`, `/api/objects/<name>`), GraphQL, and the MCP server
  all read/write records through one shared helper (`src/lib/custom-objects.ts`).
- Deleting an object cascades its fields + records in-app (all tenant-scoped).
- No cross-object joins on custom data in SQL; relationships between custom
  objects are out of scope for this tier.
