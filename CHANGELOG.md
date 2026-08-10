# Changelog

All notable changes to Fourty are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] — 2026-08-09

Fourty keeps the CRM true on its own. Connect a mailbox and it fills in what it
can from the signatures and replies already there — no API key, no data vendor,
no model — showing the evidence for every value it writes and never overwriting
one a person typed.

**Upgrading from 1.x:** Three things need your attention. Set
`FOURTY_SECRET_KEY` before connecting any new mailbox, switch any use of
`config.url` to `config.urlHost`, and make sure you are on Node ≥ 20.9.
Each is described under *Changed*. Existing mailboxes keep working; run
`npm run rekey` to encrypt what they already stored.

### Added

- **Keyless mailbox research.** Connect a mailbox and a background pass reads the
  signatures and replies already in it — filling in empty job titles and company
  links. No data vendor, no AI model, no network call. Every automatic write has
  one-click Revert, and the whole thing has a per-workspace off switch.
  See [`docs/guides/research.md`](./docs/guides/research.md).

- **Auditable suggestions.** Every finding is priced by a pure function rather
  than by a model grading its own confidence. Accept, Dismiss and Revert sit
  under the field the suggestion is about.

- **Background work ledger.** What the agent will do to a record, when, and why
  is now a row in a table — shown on the record page in plain words.

- **Agent tab on contacts, companies and deals.** Per-record AI conversations
  with durable per-user threads.

- **Mailbox credentials encrypted at rest** (AES-256-GCM). OAuth refresh tokens
  and ICS feed URLs are now encrypted under `FOURTY_SECRET_KEY`.

- **SSO & mailbox management in Settings.** Both features now have a UI for
  listing, connecting, pausing, and disconnecting.

- **Mailbox lifecycle APIs.** `PATCH` and `DELETE /api/sync/accounts/{id}` for
  rename, pause, and disconnect.

### Changed

- **Breaking — connecting a mailbox now requires `FOURTY_SECRET_KEY`.** With no
  key set, adding a mailbox is refused rather than writing a credential in the
  clear. Generate one with `openssl rand -base64 32`.

- **Breaking — `GET /api/sync/accounts` no longer returns the ICS feed URL.**
  `config.url` is replaced by `config.urlHost`. The full URL grants read access
  to the calendar, so it no longer leaves the server.

- **Breaking — Node.js ≥ 20.9 required.** Next.js 16 declares that engine.
  CI and the Docker image use Node 22.

- **Mail sync no longer holds a database transaction open across the network.**
  Both *Sync now* and the scheduled pull now use short transactions.

- **Workflows now fire for AI assistant, MCP, and GraphQL writes.** Previously
  only the REST API reliably triggered workflow events.

- **`limit=0` on contact list now returns the default page** across all APIs
  (REST, GraphQL, MCP) instead of an empty list.

- **MCP `list_contacts` now matches job title** as well as name and email.

### Fixed

- **GraphQL contact search** now matches surname, email, and job title
  (previously only matched first name).

- **Activity timeline and audit entries** now consistent across all API surfaces.

- **GraphQL deletes now clean up related data** (notes, activities, company
  references) — matching REST and MCP behavior.

## [1.0.0] — 2026-07-07

First stable release. Fourty is a complete, self-hostable CRM that runs as a
single Node.js process on top of Postgres.

### Added

- **Core CRM** — Contacts, Companies, Deals, Tasks, and Notes, each with a
  polymorphic activity timeline.
- **Kanban pipeline** — drag deals between stages with optimistic updates;
  per-column totals and probability-weighted forecasts.
- **Automatic lead scoring** — every contact gets a live 0–100 score from
  profile fit, engagement recency, and commercial signals.
- **Analytics dashboard** — open pipeline, weighted forecast, 90-day win rate,
  average sales cycle, revenue trend, funnel by stage, hottest leads, tasks due,
  and stale-deal alerts.
- **Reports** — win/loss by month, lead-source conversion, pipeline aging,
  lead-temperature and lifecycle distributions.
- **Workflow automation** — visual builder with triggers, conditions, template
  variables, five action types, and full run history.
- **Multi-currency** — deals in 12 currencies; all reporting normalizes to USD.
- **Custom fields** — add text/number/date/select/checkbox/URL fields to any
  object; instantly available in forms, detail pages, and the API.
- **CSV import/export** — fuzzy header matching, email de-duplication, and
  automatic company linking.
- **⌘K command palette** — global search and quick navigation.
- **REST API + API keys** — every resource over JSON, authenticated with
  SHA-256-hashed Bearer tokens.
- **Dark mode & PWA** — OS-aware theme with manual toggle; installable mobile
  experience.

### Engineering

- Next.js 15 (App Router) + React 19, Tailwind CSS v4, Drizzle ORM.
- 33 unit/integration tests.
- Dockerfile and GitHub Actions CI included.

---

[Unreleased]: https://github.com/olbboy/fourty/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/olbboy/fourty/releases/tag/v2.0.0
[1.0.0]: https://github.com/olbboy/fourty/releases/tag/v1.0.0
