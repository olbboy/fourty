# Records & the activity timeline

*Contacts, Companies, Deals, Tasks, and Notes — the five core objects, each with a
full history of everything that touched it.*

## The objects

| Object | What it holds |
|---|---|
| **Contacts** | People. Carry a live [lead score](./lead-scoring.md), company link, and custom fields. |
| **Companies** | Organizations. Roll up their contacts and deals. |
| **Deals** | Opportunities in a [pipeline](./pipeline.md), with amount, currency, stage, and a [health score](./lead-scoring.md#deal-health). |
| **Tasks** | To-dos with due dates, assignable to members. |
| **Notes** | Free-form text pinned to any record. The author or an admin can correct or delete one; a corrected note is marked *edited*. |

Add fields to any of these — or define entirely new objects — from Settings; see
**[Custom fields & objects](./custom-objects.md)**.

## The activity timeline

Every record has a **polymorphic activity timeline**: notes, task completions, deal
stage changes, imported emails, and workflow actions all land on the record they
concern, newest first. This is how you answer "what's the last thing that happened
with this account?" without leaving the record.

Timeline entries are also queryable over the API — `GET /api/activities`,
GraphQL `activities`, MCP `list_activities` — and a human (or a confirmed agent
write) can log an email, call, or meeting (`POST /api/activities`, GraphQL
`logActivity`, MCP `log_activity`). The list is empty without `entityType` and
`entityId`: the timeline lives on a record, not the workspace.

## Working with records

- **Create / edit / delete** contacts, companies, deals, and tasks from the UI,
  or over [REST](../api/rest.md) and [GraphQL](../api/graphql.md). Add notes on
  the record (`POST /api/notes`, GraphQL `createNote`, MCP `create_note`) and list
  them there (`GET /api/notes`, GraphQL `notes`, MCP `list_notes`; each carries
  `canChange` for the caller). Only the note's author or an admin may correct one
  (`PATCH /api/notes/{id}` with `{ body }`, `updateNote`, `update_note`) or delete
  it (`DELETE /api/notes/{id}`, `deleteNote`, `delete_note`); the timeline line the
  note left is updated or removed with it. Writes are validated with zod; a bad
  field returns `400 {"error": "field: message"}`.
- **Search** across contacts, companies, deals, and custom-object records from the **⌘K command palette** or
  `GET /api/search?q=…`.
- **Bulk-load** with [CSV import](./import-export.md), which updates on email match
  and auto-links companies. Creating a contact with an email that already exists
  is refused; the record page flags leftover duplicates (same email, or the same
  name at the same company). The create/edit form warns on a name+company match
  and still lets you save if you submit again.

## Browsing Companies

Companies search, industry filters, and sorting run on the server. The list shows
50 records per page and the total number of matching records. Search, filters,
sort, and page position live in the URL, so browser Back/Forward restores them.
**Save view** stores the current filters and sort; applying a view starts at the
first page. Selection belongs to the current page and resets when the query,
page, or workspace changes. See [CSV export scopes](./import-export.md#companies-export-scopes)
for selected, filtered, and all-record downloads.

Choose **Preview** on a row to open a read-only drawer while keeping the list
query and selection. **View full details** opens the existing record page.
Escape closes the drawer; Tab and Shift+Tab stay inside it, and focus returns to
the row action when available. An unavailable record shows a not-found state;
temporary request failures offer **Retry**. A workspace with no companies and a
search with no matches have separate empty states.

On mobile, **Companies** is available in the bottom navigation and **Filters**
opens industry/sort controls. The table scrolls horizontally to reach additional
columns and row actions. On desktop, drag the sidebar edge or focus its separator
and use arrow keys to resize, Home/End to reach its limits, or R/double-click to
reset. Only the sidebar width is saved locally.

The command palette groups record matches and navigation commands, with record
type and permitted secondary information. Arrow keys select a result and Enter
opens it; a failed search can be retried. Hidden fields are excluded from search
predicates as well as result text. Companies filters, sort, and industry facets
also respect field visibility. Missing values display as a dash; a hidden ID
removes row selection, preview, and detail links.

The [Companies API](../../src/app/api/companies/route.ts) keeps the `companies`
array and adds `page` metadata plus readable industry facets. API callers retain
the default limit of 200 and maximum of 500; the UI requests 50. Rows, count, and
facets share one database snapshot per response. Separate page requests can shift
when records are added, removed, or re-sorted between requests; offset pagination
does not provide a snapshot across pages.

## Morning task reminder

An admin can turn on **Settings → Morning task reminder**. At 8:00 in the chosen time
zone (Asia/Ho_Chi_Minh by default), everyone who owns open tasks due that day or
already overdue gets one email listing them, with a link to the task list; people with
nothing due get no email. It needs [outbound email](../self-hosting/configuration.md#outbound-email).

The worker sends it once a day: if it was down at 8:00 it sends when it comes back,
until noon, and never twice. The email is written in the language picked next to the
switch (the admin's language when they first turn it on), and links to the address
the app had when the settings were last saved.

## Owner

Contacts and companies have an **owner** like deals: the member accountable for them now.
It starts as whoever created the record (unassigned when an API key did) and can be handed
to another member in the record's form; the timeline shows *changed owner: A → B*. The
contacts and companies lists filter by owner and show it in a column, and saved views keep
that filter. Over the API: `ownerId` on create and update, `?ownerId=…|none` on the lists,
and `POST /api/contacts/reassign` / `POST /api/companies/reassign` with `{ "ids": [...],
"ownerId": "…" | null }` (GraphQL `reassignContacts`, `reassignCompanies`; MCP
`reassign_contacts`, `reassign_companies`).

## Trash

Deleting a contact, company, deal or task moves it to **Settings → Trash** with its notes
and timeline, where it waits **30 days**. **Restore** puts it back as it was: a company
re-links the contacts and deals that were under it (unless they have found another company
meanwhile), and a deal returns to its stage, its line items and the people on it. A
contact whose email another contact took meanwhile cannot be restored until one of them
changes. Anyone who may create that kind of record can restore it; only an admin deletes
for good. Over the API: `GET /api/trash`, `POST /api/trash/{id}/restore`,
`DELETE /api/trash/{id}`.

## Sending email

**Send email** on a contact's page writes to that contact; on a deal's page, to anyone on
the deal with an email address. The message leaves through this server's
[outbound email](../self-hosting/configuration.md#outbound-email) under your name, and
replies come straight to your own address. It is written on the contact's timeline, and on
the deal's when sent from one, as *emailed Lan Trần: "subject"*, and counts as a touch for the
lead score. Viewers and API keys cannot send. Each member can send 30 an hour. Without mail
set up on the server, the dialog says so. Sending from your own Gmail or Microsoft mailbox
is not offered yet.

## Permissions

Who can see and change a record is governed by:

- **Row-Level Security** — you only ever see rows in your own workspace
  ([ADR-001](../adr/001-tenancy-model.md)).
- **RBAC** — admin / member / viewer roles gate writes ([ADR-005](../adr/005-authz-model.md)).
- **Field-level permissions** *(optional)* — hide or freeze specific fields on
  contacts, companies, and deals per role from **Settings → Field permissions**,
  enforced identically on REST, GraphQL, and MCP
  ([ADR-011](../adr/011-field-level-permissions.md)). Custom-object fields are
  not per-field restricted this tier.

Every write is recorded in the **immutable audit log**. Admins read it from
**Settings → Audit log** (or `GET /api/audit`, including `?format=csv`).
Entries cannot be edited or deleted.

## Related

- **[Pipeline & deals →](./pipeline.md)**
- **[Lead scoring →](./lead-scoring.md)**
