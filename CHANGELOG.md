# Changelog

All notable changes to Fourty are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Agent tab on custom-object records.** `/objects/{apiName}/{id}` has the same
  Timeline | Agent switch as contacts. The thread binds `entityType` to the
  object's apiName. Facts/research stay contacts and companies only.

- **GraphQL `reportStats` and MCP `get_report_stats`.** Same payload as REST
  `/api/stats/reports` (field-permissions on amount).

- **Custom-object hits in search.** Prefix search (GraphQL/MCP) and the ⌘K
  palette include no-code records. `Record.object` is the apiName.

- **GraphQL/MCP pipeline reads.** `pipelines` / `pipeline(id)` / `stages` and
  MCP `list_pipelines` / `get_pipeline` match REST `GET /api/pipelines`. Writes
  stay REST. Catalogue is 39 tools.

- **GraphQL `search`.** `{ search(q: "Marchetti") { contacts { firstName company { name } } } }`
  is the MCP prefix search as a typed query — one round trip, not a REST palette
  hit list. An infix miss sets `note` the same way MCP does.

- **GraphQL `dashboardStats`.** `{ dashboardStats { kpis { pipelineValue } hotLeads { name } } }`
  is REST `/api/stats/dashboard` and MCP `get_dashboard_stats` as a typed query.
  Hidden amount fields stay null.

### Changed

- **List pages match the advertised search/sort/edit surface.** Deals search by
  name. Companies sort by updated/name/created. Contact and deal saved views
  keep the search box. Tasks can be edited, not only created or deleted.

### Fixed

- **Custom-object search.** Prefix (GraphQL/MCP), ⌘K, and `GET /api/objects/{apiName}?q=`
  match field *string values*, not JSON keys. A prefix hit is no longer dropped
  when newer infix rows fill the limit. `_` in a name is literal. `%` / `_`
  alone still return nothing.

- **Pipeline get-by-id.** GraphQL `pipeline(id)` and MCP `get_pipeline` look up
  one row and do not seed a default pipeline on a miss. REST `GET /api/pipelines`
  now checks `pipelines` read like GraphQL/MCP.

- **Agent confirm after a deleted record.** An existing thread still accepts a
  message or confirm/reject when the bound record is gone (a 404 wedged the
  global drawer and pending writes). New threads that name a missing record
  still 404. Half of `entityType` / `entityId` is 400, not an unbound chat.

- **Custom-object URL fields.** Only `http:` / `https:` become links, so a
  leftover `javascript:` value cannot run.

- **GraphQL `Task.contact`, `Task.company`, `Task.deal`.** `{ tasks { contact { firstName } } }`
  (and company/deal) is the nested read MCP `get_task` already attached as neighbour
  ids. An unpinned task, or a pin of another kind, stays null.

- **GraphQL `Note` and `Activity` pins.** `{ notes { contact { firstName } } }` and
  `{ activities { deal { name } } }` nest the same way as tasks.

- **GraphQL record child lists.** `{ contact { tasks { title } notes { body } activities { type } } }`
  (and the same on `company` / `deal`) is the REST/MCP list filtered by that record.

- **MCP `get_contact` / `get_company` / `get_deal` include `taskIds`.** Neighbours now
  list pinned tasks (capped like the other id lists) so a caller does not have to
  `list_tasks` to walk from a record to its work.

- **Agent tab grounding includes pinned tasks.** The per-record prompt lists
  `taskIds` next to company/deal neighbours, same helper MCP uses.

- **Custom-object records list pinned work.** GraphQL `{ record(object, id) { tasks { title } } }`
  and MCP `get_record` `neighbours.taskIds` use the object's apiName as `entityType`.

- **GraphQL `Task.record`, `Note.record`, `Activity.record`.** A pin whose
  `entityType` is a custom-object apiName nests `{ record { data } }` the same
  way a contact pin nests `{ contact { firstName } }`. CRM pins leave `record` null.

- **MCP `get_contact` / `get_company` / `get_deal` / `get_record` include
  `noteIds` and `activityIds`.** Neighbours already listed pinned tasks; they
  now list notes and the timeline too (same cap), so a caller does not have to
  `list_notes` / `list_activities` to walk from a record to its thread. The
  Agent tab grounding uses the same lists.

- **GraphQL `RecordFact.contact` / `RecordFact.company`.** `{ factSuggestions { contact { firstName } } }`
  nests the subject the same way a task pin does. `{ contact { facts { value } } }`
  (and `company`) is the REST/MCP inbox filtered by that record. Facts do not
  attach to deals or custom objects, so those pin fields stay null.



- **GLM chat speaks after a tool call.** GLM-4.5 thinking defaults on and writes
  to `reasoning_content`, which can exhaust `AI_MAX_TOKENS` so the Agent tab
  shows a tool check and no answer. Chat now sends `thinking: { type: "disabled" }`
  on Zhipu hosts and still ignores reasoning deltas. If a read tool ran and the
  model still returned no text, the agent asks once more without tools.



- **Agent tab stays Working while a slow provider thinks.** GLM (and similar
  OpenAI-compatible hosts) can take more than 90s before the first token. The
  chat stream now emits a JSON `heartbeat` every 15s so the composer does not
  treat that wait as *Ended*. A truly silent stream still ends at 90s.



- **GraphQL `Deal.company` and `Deal.contact`.** `{ deals { company { name } contact { firstName } } }`
  works the same way as the published `{ contacts { company { name } } }` example.
  A hidden `companyId` / `contactId` (field permissions) stays null.

- **GraphQL `Company.contacts` and `Company.deals`.** `{ company { contacts { firstName } deals { name } } }`
  is the same list REST already filtered by `companyId`, so MCP's neighbour ids
  are a full nested read on GraphQL.

- **GraphQL `Task.owner`.** `{ tasks { owner { name } } }` resolves the assigned
  member; unassigned or a deactivated member is null.

- **GraphQL `Contact.deals`.** `{ contact { deals { name } } }` is the same list
  REST already filtered by `contactId` (MCP `get_contact` neighbour deal ids).

- **GraphQL `Contact.colleagues`.** Other people at the same company, excluding
  the contact — MCP `get_contact` neighbour colleague ids as a nested read. Hidden
  `companyId` yields an empty list.

- **GraphQL `Deal.stage`.** `{ deal { stage { name daysInStage } } }` is the same
  stage clock MCP `get_deal` already attached. A hidden `stageId` stays null.

- **Custom-object list search and sort run on the server.** Saved views and the
  list page used to filter the first 200 rows in the browser. `GET /api/objects/{apiName}`
  now takes `q` and `sort` (a field key, `createdAt`, or `updatedAt`), matching
  contacts. GraphQL `records(q, sort)` and MCP `list_records` (`query`, `sort`)
  share the same helper.

- **MCP `record_fact` docs match ADR-018.** MCP is class C: a VERIFIED
  observation is not capped to probable, and it still never writes the field.
  The in-app assistant (`via: "ai"`) is the path that caps at probable.

- **`GET /api/activities` is a record timeline, not a workspace dump.** Without
  `entityType` and `entityId` it returns `[]`, matching `GET /api/notes`. The
  list also enforces `activities` read RBAC.

### Added

- **Activity timeline on GraphQL and MCP.** `{ activities(entityType:, entityId:) }`
  and MCP `list_activities` are the same record-scoped list REST already served
  (`GET /api/activities`). `logActivity` / `log_activity` logs an email, call, or
  meeting the same way as `POST /api/activities` (feeds a contact's lead score).
  Catalogue is 36 tools.

- **Task assignment.** Create and update a task with `ownerId` (a workspace
  member) on REST, GraphQL, and MCP. Members are listed from
  `GET /api/tasks/assignees`, GraphQL `assignees`, and MCP `list_assignees`.
  The tasks page and the record-page task panel use
  that list. An unknown id is refused; omitting `ownerId` still assigns to the
  caller (or leaves the task unassigned for an API key).

- **Pipeline stages in Settings.** Rename a stage, move it up or down, add or
  delete an extra open stage, and set its win probability (0–100%) from
  *Settings → Pipelines*. `POST /api/stages` inserts before Won/Lost and accepts
  optional hex `color` (else the warm-neutral default); `PATCH /api/stages/{id}`
  is the rename/reorder path (setting `order` swaps with the occupant);
  `DELETE /api/stages/{id}` refuses Won/Lost, the last open stage, and any stage
  that still has deals. GET `/api/pipelines` still lists them. Type
  (open/won/lost) is unchanged so won/lost workflows keep their meaning. The
  same Save also writes `color` (hex) so the kanban dots match.

- **Multiple pipelines.** *Settings → Pipelines* can add another 7-stage
  pipeline (`POST /api/pipelines`), rename it (`PATCH /api/pipelines/{id}`), or
  delete it when it has no deals and is not the last board
  (`DELETE /api/pipelines/{id}`). The Deals board already switches when more
  than one exists; new deals default to the board you are looking at.

- **Edit custom fields in Settings.** Relabel, retype, change select options, or
  mark required on a contact/company/deal field from *Settings → Custom fields*.
  The key stays fixed. A change that would invalidate existing records is
  refused with `409`, matching no-code object fields. The new-field form can
  mark required too; creating a required field is refused the same way when
  existing records would be blank.

- **Edit custom-object fields in Settings.** Relabel, retype, change select
  options, or mark required from the type's row. The key stays fixed. A change
  that would invalidate existing records is refused with the same `409` as the
  API. Adding a field as required is refused the same way when existing records
  would be blank.

- **Two-factor authentication UI.** Enroll from *Settings → Two-factor
  authentication* — scan a QR (rendered by a new dependency-free encoder,
  verified bit-for-bit against an independent implementation) or type the key,
  confirm with the first code, and save the one-time backup codes. The login
  form now asks for the code when an account has 2FA on; disabling requires the
  account password. Previously the whole feature was API-only.

- **Custom objects in the app.** Define a type and its fields from
  *Settings → Custom objects*. Each type gets a sidebar entry, a list page, and
  a detail page — the no-code path the API already served, now usable without
  curling REST.

- **Field permissions in Settings.** Hide a field or freeze it read-only for
  members and viewers from *Settings → Field permissions*. Admins still bypass
  every rule; posting both flags true still clears one. Previously API-only.

- **Audit log in Settings.** Admins read the immutable workspace log from
  *Settings → Audit log* and can export CSV. Previously API-only.

- **Webhook signing secret in Settings.** Admins copy and rotate the
  per-workspace HMAC secret from *Settings → Webhooks*. Previously API-only.

- **Notes and timeline on custom objects.** A custom-object record carries the
  same notes panel and activity timeline as a contact. `create_note` accepts
  the object's apiName as `entityType`.

- **Saved views on custom-object lists.** Search, sort, and + Save view work on
  a no-code object's list the same way they do on contacts. `/api/saved-views`
  accepts the object's apiName as `entity`.

- **Saved views on companies, deals, and tasks.** + Save view now sits on every
  built-in list, not only contacts. A deals view remembers pipeline and
  kanban/list; a tasks view remembers open/done/all.

- **Next best action on contacts and deals.** A deterministic rule (no LLM)
  names one next step on the record page — missing email, quiet deal, overdue
  close date — the ADR-016 Tier 2 piece that scoring didn't cover.

- **Contact email duplicates are refused.** Creating or renaming a contact to an
  email another contact already uses (case-insensitive) returns 400 on REST,
  GraphQL and MCP. The form links to the existing record; the detail page lists
  leftover duplicates.

- **GraphQL deal mutations.** `createDeal` / `updateDeal` / `deleteDeal` share
  the same action as REST and MCP, so a stage move over GraphQL fires the same
  won/lost workflows and recomputes the health score. `Deal.score` is now
  queryable.

- **Task writes on GraphQL and MCP.** `createTask` / `updateTask` / `deleteTask`
  (and MCP `update_task` / `delete_task`) share the REST completion path:
  marking a task done fires `task.completed` and logs on the linked record.
  MCP `delete_task` is dry-run unless `confirm: true`.

- **GraphQL `createNote`.** Adding a note over GraphQL, REST, or MCP is the same
  action: timeline `note_added` on the linked record, and a contact's lead
  score is recomputed.

- **GraphQL `contacts(sort)` and `Contact.company`.** The documented example
  `{ contacts(sort: "score") { company { name } } }` now runs. `sort` is the
  same argument REST already accepted (`score` / `name` / `createdAt`);
  `company` is null when the contact has no company or `companyId` is hidden.

- **GraphQL `contacts(status, companyId)` matches REST and MCP.** The shared
  list action already filtered by status and company; the GraphQL adapter
  omitted the args, so a company's people could not be listed without pulling
  every contact.

- **GraphQL `notes(limit)` matches REST and MCP.** The shared list action
  already clamped `limit` (default/max 500); the GraphQL adapter omitted the
  arg, so a record's notes could not be paginated without pulling every note
  on that record.

- **GraphQL `tasks` accepts the same filters as REST and MCP.** `entityType`,
  `entityId`, `state` (open/done/all), and `sort` were on the shared action
  but dropped at the GraphQL adapter, so a record's tasks could not be listed
  without pulling every task in the workspace. Omitted args still default to
  all tasks, newest first.

- **GraphQL `deals` accepts the same filters as REST and MCP.** `stageId`,
  `pipelineId`, `companyId`, and `contactId` were on the shared action but
  dropped at the GraphQL adapter, so a company's deals could not be listed
  without pulling the whole board.

- **GraphQL `companies(industry)` matches REST and MCP.** The shared list
  action already filtered by industry; the GraphQL adapter omitted the arg.

- **Name + company duplicate flag.** The contact page lists other people with
  the same folded name at the same company, alongside leftover email
  duplicates. The create/edit form warns and links the existing record;
  submit again to save anyway. Only email is a hard refuse.

- **MCP `update_record` / `delete_record`.** Custom-object records can be
  patched and deleted over MCP the same way as REST/GraphQL. Delete is dry-run
  unless `confirm: true`.

- **MCP `get_record`.** Fetch one custom-object record by api name and id,
  matching `get_contact` / `get_company` / `get_deal`.

- **MCP `get_task`.** Fetch one task by id, plus the record it is pinned to.

- **Company writes share one action.** REST, GraphQL, and MCP create/update/
  delete a company through the same definition, so MCP `create_company` /
  `update_company` advertise every field REST already accepted (website, city,
  annualRevenue, …) instead of a three-field subset. Delete still detaches
  contacts and deals; MCP delete is dry-run unless `confirm: true`.

- **MCP `get_contact` / `get_company` / `get_deal` read through the same
  action as REST and GraphQL.** Neighbour ids (colleagues, stage clock, …) are
  still attached on the MCP payload. `GET /api/deals/{id}` and GraphQL `deal`
  share `deals.get`.

- **MCP `get_task` shares REST and GraphQL.** `GET /api/tasks/{id}` and GraphQL
  `task(id)` fetch one task; MCP still attaches the parent record as
  neighbours.

- **MCP `list_deals` shares REST and GraphQL.** Agents can filter by deal name
  (`query`) and by stage/company/contact, matching `GET /api/deals`. Default
  page size on MCP stays 50.

- **MCP `list_tasks` shares REST and GraphQL.** Entity filters and `state`
  (open/done/all) are the same action. MCP and GraphQL still list newest-first
  including completed; REST still defaults to open tasks by due date.

- **MCP `list_notes`.** Notes on a contact, company, deal, or custom-object
  record are readable over MCP the same way as REST `GET /api/notes` and
  GraphQL `notes`. Catalogue is 33 tools. `tools/list`, `docs/api/mcp.md`, and
  `public/llms.txt` are locked to that set so a new tool cannot ship while the
  lists stay stale. `llms.txt` was missing `get_contact` / `get_company` /
  `get_deal`, `list_notes`, and the fact tools.

### Fixed

- **Workflow templates print dates, not unix millis.** `{{closedAt}}` (and the
  other timestamp fields on a record) render as `YYYY-MM-DD` in notes, tasks,
  and log lines.

- **The won-deal tutorial opens from Workflows in the sidebar.** The builder was
  never in Settings. Diagnostics, the AI assistant guide, and the workflow
  reference name the same path.

- **Custom fields on contacts, companies, and deals are validated on write.** A
  `url` field no longer accepts `javascript:`; numbers, dates, selects, and
  required flags use the same checks as no-code objects. Leftover values from a
  deleted field stay in the blob. REST, GraphQL, and MCP share the path.

- **Custom-object field retype no longer strands invalid records.** Changing a
  field's type, select options, or required flag is refused with `409` when an
  existing record would break under the new definition — for example a
  `javascript:` string left in a text field being retyped to `url`. Relabel and
  reorder still apply. Fix the offending records, then retry.

- **Command-palette search respects field permissions.** `GET /api/search`
  no longer puts a hidden contact email (or a hidden deal amount) in the
  subtitle. MCP search already redacted; the REST path used by ⌘K did not.

- **CSV export respects field permissions.** A role that cannot read
  `contacts.email` (or another hidden column) no longer gets that column in
  `/api/export/{contacts,companies,deals}`. The user guide already claimed this.

- **CSV export of deals includes the primary contact.** `/api/export/deals`
  writes a `contact` column (resolved name, same as `company`). A role that
  cannot read `deals.contactId` does not get the column. Form and detail
  already showed the field.

- **CSV export of deals includes the pipeline.** `/api/export/deals` writes a
  `pipeline` column (resolved name) so stages on a second board are not
  ambiguous. A role that cannot read `deals.pipelineId` does not get the
  column. Form, detail, and the deals board already showed the field.

- **CSV export includes custom fields.** `/api/export/{contacts,companies,deals}`
  appends a column per current field definition (the stable key, same order as
  the form). A role that cannot read the `custom` blob does not get those
  columns. Leftover values from a deleted field stay off the sheet.

- **CSV import writes contact custom fields.** A column matching a field key or
  label is coerced the same way as REST (dates, checkboxes, `javascript:` URLs
  rejected). Invalid cells are skipped; a new row missing a required custom
  field is skipped. A role that cannot write `custom` does not get those
  columns applied.

- **Per-record AI prompt respects field permissions.** The Agent tab no longer
  injects a hidden email (or amount) into the model context. Tool calls already
  redacted; the grounding block did not.

- **Custom-object writes share a timeline and delete cleanup.** Creating or
  updating a no-code record over GraphQL or MCP now logs the same `created` /
  `updated` timeline entry REST always did. Deleting one over GraphQL now
  removes its notes and activities, matching REST and MCP.

- **CSV import updates on email match.** Re-importing a contact with the same
  email (case-insensitive) now updates the existing row instead of skipping it,
  matching the documented dedupe behaviour.

- **Notes are documented as append-only.** The user guide and REST reference
  no longer claim edit/delete for notes. The UI, REST, GraphQL, and MCP only
  add notes; that matches [ADR-008](./docs/adr/008-graphql-api.md).

### Changed

- **A custom-object field can no longer be retyped, made required, or have its
  select options narrowed when an existing record would break under the new
  definition.** `PATCH /api/custom-objects/{id}/fields/{fieldId}` now returns
  `409` with a message naming the problem, instead of leaving stale or unsafe
  values (for example a `javascript:` string in a field retyped to `url`) in
  place until each record's next write. Fix the offending records first, then
  retry the change.


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
