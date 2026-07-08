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
- Enforced in the REST handlers for **contacts, companies, deals** (list + detail
  reads redact; create + update reject a blocked field with 403).
- Writes are checked against the **caller's actual body keys**, not the
  zod-parsed object — so a defaulted field (e.g. `status`) isn't mistaken for a
  write. `parseBody` now returns those keys.
- Management API `/api/field-permissions` is **admin-only**; a fully-permissive
  rule is stored as *no rule* (deleted).

### Why not enforce in GraphQL/MCP too (yet)?
REST is the primary write surface and where the test lives. GraphQL field
resolvers and MCP tools can adopt the same helper next; documented as follow-up
rather than half-done silently.

## Consequences
- A redacted field is **absent** from the JSON (not null) — the UI already renders
  missing fields as "—".
- Rules are cheap (few rows/workspace) and loaded once per request.
- Field-level rules on custom objects/records are out of scope for this tier.
