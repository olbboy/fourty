# ADR-005 — Authorization model

**Status:** Accepted · **Date:** 2026-07-07

## Context
The SQLite app had a dead `users.role` column, no enforcement, and no concept of
a user belonging to multiple workspaces. Multi-tenancy makes "role" a property of
**membership**, not of the global user.

## Options
1. **Role on the global user** (current dead column). Wrong: a user may be admin
   in one workspace and viewer in another.
2. **Role on the membership** (`workspace_member.role`) + a permission matrix
   checked at the route layer.

## Decision
**Option 2 — membership-scoped roles + explicit permission matrix.**

- `workspace_member(workspace_id, user_id, role)` with `role ∈ {admin, member,
  viewer}` (extensible). A user ↔ workspace is n-to-n; role lives on the edge.
- **Permission matrix** `role × object × action → allow/deny`, enforced in a
  route-layer guard for every mutation. Baseline (B3):
  - `viewer`: read-only on CRM objects.
  - `member`: read/write CRM objects; no settings/user/key management.
  - `admin`: everything incl. member management, API keys, workflows, settings.
- **Route-coverage guard:** a generated test asserts every mutating endpoint has
  a matrix entry; a new route without one **fails CI** (prevents "forgot to
  authorize").
- **API keys belong to a workspace** and carry **scopes** (e.g. `contacts:read`,
  `deals:write`). A key authenticates *and* authorizes within its one workspace;
  it can never widen to another (enforced by ADR-001 RLS too).
- **Session carries the active workspace.** Switching workspace re-derives the
  auth context server-side (new `workspace_id` in the transaction), never a
  client-supplied filter.
- **Field-level permissions** are deferred to a later tier (Twenty ships them);
  object-level is the B3 baseline. Stated so we don't over-claim parity.

## Trade-offs
- A matrix + coverage guard is more upfront work than ad-hoc `if (role==='admin')`
  checks, but it's the only way to make RBAC *testable* and regression-proof,
  which the mission requires.
- Audit log (append-only, tamper-evident) is part of B3, not this ADR, but
  depends on this context (actor + workspace + action).
