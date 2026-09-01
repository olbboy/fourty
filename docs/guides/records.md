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
| **Notes** | Free-form text pinned to any record. Append-only — add from the record; no edit or delete. |

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
  or over [REST](../api/rest.md) and [GraphQL](../api/graphql.md). Notes are
  **append-only**: add them on the record (`POST /api/notes`, GraphQL
  `createNote`, MCP `create_note`). List them on the record (`GET /api/notes`,
  GraphQL `notes`, MCP `list_notes`). Writes are validated with zod; a bad field
  returns `400 {"error": "field: message"}`.
- **Search** across contacts, companies, deals, and custom-object records from the **⌘K command palette** or
  `GET /api/search?q=…`.
- **Bulk-load** with [CSV import](./import-export.md), which updates on email match
  and auto-links companies. Creating a contact with an email that already exists
  is refused; the record page flags leftover duplicates (same email, or the same
  name at the same company). The create/edit form warns on a name+company match
  and still lets you save if you submit again.

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
