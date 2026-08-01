# Changelog

All notable changes to Fourty are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Workflows now run for records created or updated through the AI assistant,
  MCP clients, and the GraphQL API.** Until now only the REST API reliably fired
  workflow events, so a contact created by an agent silently skipped every
  workflow — no error, no log. If you have workflows on contacts or companies,
  expect them to start firing for these sources. Deal workflows are unaffected;
  they already fired everywhere. Nothing fires on delete, on any surface — that
  is unchanged.

### Changed

- **Two error messages about contacts changed wording.** Refusing a write to a
  field your role may not edit now reads `Forbidden: cannot write contacts
  field(s): status` on the REST API, matching what the GraphQL and MCP APIs
  already said; it used to read `Not permitted to set field(s): status`. The
  HTTP status is still 403. Invalid input reported by an MCP tool now names the
  field first — `firstName: Required` instead of `Required` — again matching the
  other two APIs. If you match on these strings, update your patterns.
- **Asking a contact list for `limit=0` now returns the default page** over the
  GraphQL and MCP APIs, instead of an empty list; the REST list has always
  behaved this way, and the three now agree.

### Fixed

- **Searching contacts over GraphQL now looks at the same fields as the REST
  API.** `contacts(q:)` only matched a contact's first name, so a search by
  surname, email address, or job title returned nothing — the REST list has
  always matched all of those. Surrounding whitespace in the search term is now
  ignored too, again matching REST.
- **Activity timeline and audit entries no longer depend on which API you used.**
  Creating or updating a company through GraphQL or MCP now appears on the
  activity timeline, updates record which fields changed, and an update that
  changes nothing no longer leaves a misleading "updated" entry. Audit entries
  for updates now carry the changed field names on every surface.

- **GraphQL deletes now clean up related data.** Deleting a contact or a company
  through the GraphQL API removes the record's notes and activities, and detaches
  contacts and deals from a deleted company — matching what the REST API and the
  MCP server have always done. Previously the GraphQL path left orphaned notes
  and activities behind, and left contacts and deals pointing at a `companyId`
  that no longer existed.

  Existing damaged rows are **not** cleaned up automatically. If you have ever
  deleted a contact or company over GraphQL, these queries count what was left
  behind (run them per workspace, or drop the `workspace_id` filter to scan all):

  ```sql
  -- notes/activities pointing at a contact or company that no longer exists
  SELECT 'notes' AS table, count(*) FROM notes n
   WHERE (n.entity_type = 'contact' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = n.entity_id))
      OR (n.entity_type = 'company' AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = n.entity_id))
  UNION ALL
  SELECT 'activities', count(*) FROM activities a
   WHERE (a.entity_type = 'contact' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = a.entity_id))
      OR (a.entity_type = 'company' AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = a.entity_id));

  -- contacts/deals pointing at a company that no longer exists
  SELECT 'contacts' AS table, count(*) FROM contacts c
   WHERE c.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = c.company_id)
  UNION ALL
  SELECT 'deals', count(*) FROM deals d
   WHERE d.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = d.company_id);
  ```

  Deciding what to do with those rows is yours — deleting data is not something
  an upgrade should do on your behalf.

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
