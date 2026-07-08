# ADR-011 — Field-level permissions

**Status:** Accepted · **Date:** 2026-07-08

## Context
Object-level RBAC (ADR-005) gates whole objects per role. Twenty also restricts
individual **fields** (view/edit per role) — the last named RBAC gap. We need
per-field read/write control on the core objects without rewriting every route or
the response serializer.

## Decision
**A sparse `field_permissions` table + a shared enforce helper.**

- One row per `(object, field, role)` with `can_read` / `can_write`. **Absence of a
  rule means allowed** (backward compatible), and **admin is never restricted**.
  Workspace-scoped + RLS (migration `0008`).
- `src/lib/field-permissions.ts`: `loadFieldPolicy(role)` (one query, null for
  admin) → `redact(policy, object, row)` drops unreadable fields from a response,
  `blockedWrites(policy, object, keys)` returns disallowed write keys.
- Enforced for **contacts, companies, deals** on **every read/write surface** —
  REST handlers, the GraphQL resolvers (`src/lib/graphql/schema.ts`), and the MCP
  tools (`src/mcp/tools.ts`) — via the same `redact`/`blockedWrites` helper. Reads
  redact unreadable fields; create + update refuse a blocked field (REST 403,
  GraphQL `FORBIDDEN`, MCP `isError`). No surface is a bypass door.
- Writes are checked against the **caller's actual input keys**, not the
  zod-parsed object — so a defaulted field (e.g. `status`) isn't mistaken for a
  write. `parseBody` returns those keys for REST; GraphQL/MCP read them off the raw
  input.
- Management API `/api/field-permissions` is **admin-only**; a fully-permissive
  rule is stored as *no rule* (deleted).

## Consequences
- A redacted field is **absent** from the JSON (not null) — the UI already renders
  missing fields as "—".
- Rules are cheap (few rows/workspace) and loaded once per request.
- Field-level rules on custom objects/records are out of scope for this tier.
