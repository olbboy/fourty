# Changelog

All notable changes to Fourty are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-07-07

First stable release. Fourty is a complete, self-hostable CRM that runs as a
single Node process on top of SQLite — no Postgres, Redis, or queue servers.

### Added

- **Core CRM** — Contacts, Companies, Deals, Tasks, and Notes, each with a
  polymorphic activity timeline. List views with search, filter, and sort;
  full record detail pages.
- **Kanban pipeline** — drag deals between stages with optimistic updates;
  per-column totals and probability-weighted forecasts. List view included.
- **Automatic lead scoring** — every contact gets a live 0–100 score from
  profile fit, engagement recency, and commercial signals. Pure, tested model.
- **Analytics dashboard** — open pipeline, weighted forecast, 90-day win rate,
  average sales cycle, revenue trend, funnel by stage, hottest leads, tasks
  due, and stale-deal alerts.
- **Reports** — win/loss by month, lead-source conversion, pipeline aging,
  lead-temperature and lifecycle distributions.
- **Workflow automation** — visual builder with triggers, conditions, template
  variables (`{{firstName}}`), five action types (create task, add note,
  update field, webhook, log), and full run history. Runs in-process.
- **Multi-currency** — deals in 12 currencies; all reporting normalizes to USD.
- **Custom fields** — add text/number/date/select/checkbox/URL fields to any
  object; instantly available in forms, detail pages, and the API.
- **CSV import/export** — fuzzy header matching, email de-duplication, and
  automatic company linking/creation on import.
- **⌘K command palette** — global search across contacts, companies, and deals
  plus quick navigation.
- **REST API + API keys** — every resource over JSON, authenticated with
  SHA-256-hashed Bearer tokens; outbound webhooks via workflow actions.
- **Dark mode & PWA** — OS-aware theme with manual toggle; installable mobile
  experience with a native-style bottom nav.
- **Self-initializing** — schema and a default 7-stage pipeline are created on
  first boot; optional demo data from the setup screen.

### Engineering

- Next.js 15 (App Router) + React 19, Tailwind CSS v4, Drizzle ORM over
  better-sqlite3 (WAL mode).
- 33 unit/integration tests (scoring, CSV, currency, workflow engine).
- MIT licensed. Dockerfile and GitHub Actions CI included.

[1.0.0]: https://github.com/olbboy/fourty/releases/tag/v1.0.0
