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
| **Notes** | Free-form text pinned to any record. |

Add fields to any of these — or define entirely new objects — from Settings; see
**[Custom fields & objects](./custom-objects.md)**.

## The activity timeline

Every record has a **polymorphic activity timeline**: notes, task completions, deal
stage changes, imported emails, and workflow actions all land on the record they
concern, newest first. This is how you answer "what's the last thing that happened
with this account?" without leaving the record.

Timeline entries are also queryable over the API at `/api/activities` — see the
[REST reference](../api/rest.md).

## Working with records

- **Create / edit / delete** from the UI, or over [REST](../api/rest.md) and
  [GraphQL](../api/graphql.md). Writes are validated with zod; a bad field returns
  `400 {"error": "field: message"}`.
- **Search** across contacts, companies, and deals from the **⌘K command palette** or
  `GET /api/search?q=…`.
- **Bulk-load** with [CSV import](./import-export.md), which dedupes by email and
  auto-links companies.

## Permissions

Who can see and change a record is governed by:

- **Row-Level Security** — you only ever see rows in your own workspace
  ([ADR-001](../adr/001-tenancy-model.md)).
- **RBAC** — admin / member / viewer roles gate writes ([ADR-005](../adr/005-authz-model.md)).
- **Field-level permissions** *(optional)* — hide or freeze specific fields per role,
  enforced identically on REST, GraphQL, and MCP ([ADR-011](../adr/011-field-level-permissions.md)).

Every write is recorded in the **immutable audit log**.

## Related

- **[Pipeline & deals →](./pipeline.md)**
- **[Lead scoring →](./lead-scoring.md)**
