# Key features

*A guided tour of everything in the box. Each item links to its full guide.*

## Core CRM

- **[Records & timeline](../guides/records.md)** — Contacts, Companies, Deals, Tasks,
  and Notes, each with a polymorphic **activity timeline** so every touch is on the
  record.
- **[Pipeline & deals](../guides/pipeline.md)** — a drag-and-drop **Kanban** with
  per-column totals and probability-weighted forecasts that update optimistically.
- **[Multi-currency](../guides/pipeline.md#multi-currency)** — deals in 12 currencies,
  every report auto-normalized to USD.

## Intelligence (deterministic, no LLM)

- **[Automatic lead scoring](../guides/lead-scoring.md)** — every contact gets a live
  0–100 score from profile fit, engagement recency, and commercial signals. Hot leads
  surface on the dashboard; the model is a pure function you tune in one file.
- **[Deal health scoring](../guides/lead-scoring.md#deal-health)** — a zero-config
  win-likelihood score per deal, anchored on stage probability and adjusted for
  momentum, stalling, and overdue close dates.
- **[Analytics & reports](../guides/analytics.md)** — open pipeline, weighted forecast,
  90-day win rate, average sales cycle, revenue trend, funnel by stage, win/loss by
  month, lead-source conversion, pipeline aging, stale-deal alerts.

## Automation & extensibility

- **[Workflows](../guides/workflows.md)** — "When a deal is won → create an onboarding
  task and add a note." A visual builder with conditions, template variables, five
  action types, and full run history, running on a **durable Postgres-backed queue**.
- **[Custom fields & objects](../guides/custom-objects.md)** — add fields to any object,
  or define whole **no-code custom objects** (Projects, Tickets…) served over REST,
  GraphQL, and MCP.

## APIs & AI

- **[REST API](../api/rest.md)** — everything the UI does, over JSON, with revocable
  SHA-256-hashed keys.
- **[GraphQL API](../api/graphql.md)** — a single typed `POST /api/graphql` with
  introspection.
- **[MCP server](../api/mcp.md)** — expose Fourty to Claude, Cursor, and other LLM
  clients over stdio or HTTP (20 tools, workspace + role enforced).
- **[AI assistant](../guides/ai-assistant.md)** *(optional, BYO key)* — an in-app chat
  that reads your CRM and **proposes** writes you confirm. Off unless you set a key.

## Data & integrations

- **[CSV import/export](../guides/import-export.md)** — fuzzy header matching, dedupe by
  email, company auto-linking.
- **[Email & calendar](../guides/email-calendar.md)** — connect a Gmail or Microsoft
  mailbox over read-only OAuth, or subscribe to ICS calendar feeds.
- **[Outbound webhooks](../api/webhooks.md)** — POST entity snapshots to n8n, Zapier,
  Slack, or your own services, signed with per-workspace HMAC.

## Platform

- **Multi-tenant with Row-Level Security** — every row scoped to one workspace by
  Postgres RLS ([ADR-001](../adr/001-tenancy-model.md)).
- **RBAC + immutable audit log** — admin/member/viewer roles, optional field-level
  permissions, every write recorded.
- **2FA (TOTP), signed webhooks, SSO via OIDC** — the security tier
  ([ADR-012](../adr/012-two-factor-auth.md)/[013](../adr/013-webhook-signatures.md)/[014](../adr/014-sso-oidc.md)).
- **i18n & accessibility** — English + Vietnamese out of the box; accessible dialog,
  combobox, and focus semantics.
- **Dark mode & PWA** — theme follows your OS; installable on mobile with a native
  bottom nav.
- **⌘K command palette** — search or jump anywhere without the mouse.

## Next

- **[User guide →](../guides/)** — how each of these works in practice.
- **[Self-hosting →](../self-hosting/)** — run it yourself.
