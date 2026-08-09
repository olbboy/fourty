# Changelog

All notable changes to Fourty are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0] — 2026-08-09

Fourty keeps the CRM true on its own. Connect a mailbox and it fills in what it
can from the signatures and replies already there — no API key, no data vendor,
no model — showing the evidence for every value it writes and never overwriting
one a person typed.

**Upgrading from 1.x:** three things need your attention. Set
`FOURTY_SECRET_KEY` before connecting any new mailbox, switch any use of
`config.url` to `config.urlHost`, and make sure you are on Node 20.9 or newer.
Each is described under *Changed*. Existing mailboxes keep working; run
`npm run rekey` to encrypt what they already stored.

### Added

- **Fourty now fills in contact fields from your own mailbox, with no API key.**
  Connect a mailbox and a background pass reads the signatures and replies
  already in it: an empty job title or company link is filled in, with the
  evidence shown under the field. There is no data vendor, no AI model and no
  network call involved — it is a parser, so it works on a fresh install with
  nothing configured. A value a person typed is never overwritten; a job change
  against it arrives as a suggestion instead. Every automatic write has one-click
  Revert, and the whole thing has a per-workspace off switch in
  Settings → Diagnostics. Historical mail is not re-read: research starts from
  the next sync. See `docs/guides/research.md`.
- **Suggestions you can audit.** Every finding is priced by a pure function
  rather than by a model grading its own confidence. A lone email signature is a
  suggestion, not a write; two sources that disagree hold the field entirely and
  nothing is written. Accept, Dismiss and Revert sit under the field the
  suggestion is about, and a dismissed value is never offered again.
- **A background work ledger.** What the agent will do to a record, when, and
  why is now a row in a table rather than an opaque job payload — shown on the
  record page in plain words. Connected mailboxes are pulled on a schedule from
  this ledger, so a mailbox stays in sync without anyone pressing *Sync now*.
- **An Agent tab on contacts, companies and deals.** A conversation about *that*
  record, with durable per-user threads: two reps asking about one contact are
  having two conversations, and a transcript survives a reload, a tab switch and
  an unreachable provider. With no AI provider configured the tab still opens,
  says so plainly, and shows what the keyless research pass found.
- **Mailbox credentials are encrypted at rest.** An OAuth refresh token — and a
  private ICS feed URL, which carries its own secret in the path — are stored
  with AES-256-GCM under a new `FOURTY_SECRET_KEY`, which lives in the
  environment and never in the database. A database dump, a backup or a read
  replica no longer hands over the mailboxes. It is not protection from an
  attacker who already has the running process. `npm run rekey` rotates the key
  with no window in which anything is unreadable, and is also how an install
  that has just set a key encrypts rows that predate it. See `SECURITY.md` and
  ADR-019.
- **Single sign-on and mailboxes can be set up from Settings.** Both features
  already worked, but only over the API — adding an OIDC provider meant a curl
  request with a client secret on the command line. Settings now lists and
  manages OIDC providers (admins only) and mailbox/calendar connections,
  including running the OAuth connect, pulling on demand, pausing, and
  disconnecting. The SSO client secret stays write-only: it is never returned,
  and leaving the field blank when editing keeps the existing one.
- **A mailbox can be renamed, paused, and disconnected** —
  `PATCH` and `DELETE /api/sync/accounts/{id}`, which did not exist before.
  Disconnecting also drops the ingested mail and calendar rows recorded against
  that account; email and meeting entries already filed on a contact's timeline
  are keyed to the contact and stay. Only a failed pull can put an account into
  the error state, so the update endpoint accepts `active` and `paused` only.

### Changed

- **Breaking — connecting a mailbox now requires `FOURTY_SECRET_KEY`.** With no
  key set, adding a mailbox or calendar of any kind is refused with a message
  naming the fix, rather than writing a credential to the database in the clear.
  Mailboxes connected before this upgrade keep working untouched, and are
  encrypted the next time their token refreshes — or immediately, if you run
  `npm run rekey`. An ICS feed used to be the one mailbox type that needed no
  key; its URL is a credential, so it now does. Generate one with
  `openssl rand -base64 32`, and back it up somewhere other than beside your
  database dumps.
- **Breaking — `GET /api/sync/accounts` no longer returns the ICS feed URL.**
  `config.url` is replaced by `config.urlHost` (for example
  `calendar.google.com`). The full URL grants read access to the calendar, so it
  no longer leaves the server, not even for an admin. If you displayed
  `config.url`, switch to `config.urlHost`.
- **Breaking — Node.js 20.9 or newer is required.** Fourty is on Next.js 16,
  which declares that engine; Node 20.0–20.8 no longer work. The Docker image and
  CI already use Node 22. This upgrade also closed eight dependency advisories
  that had been failing the security gate.
- **Mail sync no longer holds a database transaction open across the network.**
  Pulling a mailbox used to keep a Postgres connection idle for the whole
  round-trip to Google. Both *Sync now* and the scheduled pull now open short
  transactions around the fetch instead. Nothing changes about what you see; it
  matters when several mailboxes sync at once.
- **Workflows now run for records created or updated through the AI assistant,
  MCP clients, and the GraphQL API.** Until now only the REST API reliably fired
  workflow events, so a contact created by an agent silently skipped every
  workflow — no error, no log. If you have workflows on contacts or companies,
  expect them to start firing for these sources. Deal workflows are unaffected;
  they already fired everywhere. Nothing fires on delete, on any surface — that
  is unchanged.
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
- **Listing contacts over MCP now matches job title as well as name and email.**
  The `list_contacts` tool searched only names and email addresses, so an agent
  looking for "Rear Admiral" found nobody while the same search over REST found
  them. All three APIs now search the same three fields. The page size and its
  200-row ceiling are unchanged.

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

[2.0.0]: https://github.com/olbboy/fourty/releases/tag/v2.0.0
[1.0.0]: https://github.com/olbboy/fourty/releases/tag/v1.0.0
