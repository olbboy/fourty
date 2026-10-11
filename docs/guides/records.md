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
