# Glossary

*The vocabulary used across these docs. Skim it once and the rest reads faster.*

### Workspace
A tenant — one organization's isolated data. Every record belongs to exactly one
workspace, and [Row-Level Security](#row-level-security-rls) guarantees you never see
another workspace's rows. See [ADR-001](../adr/001-tenancy-model.md).

### Row-Level Security (RLS)
A Postgres feature that filters rows by a policy at the database layer. Fourty's app
connects as a **non-owner** role so RLS can't be bypassed, even by a bug in application
code — tenancy is enforced by Postgres, not by `WHERE` clauses.

### RBAC (role-based access control)
The permission model: every member and API key acts at a role — **admin**, **member**,
or **viewer** — which gates what it can write. See [ADR-005](../adr/005-authz-model.md).

### Field-level permissions
An optional layer on top of RBAC that hides or freezes **specific fields** per role,
enforced identically on REST, GraphQL, and MCP. See [ADR-011](../adr/011-field-level-permissions.md).

### Audit log
An append-only, immutable record of every write — who changed what, when. AI-assisted
writes are tagged so you can tell them apart.

### Pipeline
An ordered set of [stages](#stage) a [deal](#deal) moves through. A workspace can run
several pipelines; the default has seven stages.

### Stage
One step in a pipeline, carrying a **win probability** (0–100%) that drives the weighted
forecast and the [deal health score](#deal-health-score).

### Deal
An opportunity, with an amount, a currency, a stage, and optional links to contacts and
companies. Also called an *opportunity* in other CRMs.

### Lead score
A deterministic **0–100** score on every contact, computed from profile fit, engagement
recency, and commercial signals by a pure function. See [Lead scoring](../guides/lead-scoring.md).

### Deal health score
A deterministic **0–100** win-likelihood score on every deal, anchored on stage
probability and adjusted for momentum, stalling, and overdue dates. See
[Deal health](../guides/lead-scoring.md#deal-health).

### Activity timeline
The chronological history attached to every record — notes, task completions, stage
changes, synced emails, and workflow actions. It is *polymorphic*: one timeline model
serves every object.

### Custom object
A no-code object type you define yourself (Projects, Tickets…), stored
**metadata-driven** with no per-object schema migration. See [ADR-007](../adr/007-custom-objects.md).

### Workflow
An automation: a **trigger** (a CRM event) → optional **conditions** → one or more
**actions**. Runs on the durable queue. See [Workflows](../guides/workflows.md).

### Worker
A separate process (`npm run worker`) that drains jobs — webhook deliveries and workflow
actions — from the queue, off the request path.

### Queue (pg-boss)
The durable job queue, living in Postgres itself (no Redis), with retry, backoff,
dead-lettering, and an idempotency ledger. See [ADR-004](../adr/004-queue-and-workers.md).

### MCP (Model Context Protocol)
The open protocol Fourty speaks so LLM clients (Claude, Cursor) can call CRM tools. See
[MCP server](../api/mcp.md).

### API key
A workspace-scoped bearer token (`frty_...`) that acts at a fixed role. SHA-256-hashed at
rest, revocable. See [API overview](../api/overview.md).

## Related

- **[Why Fourty →](./why-fourty.md)** · **[Architecture →](../architecture.md)**
