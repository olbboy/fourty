# Custom fields & objects

*Extend the data model without writing code or running a migration — new fields on
existing objects, or entirely new object types.*

## Custom fields

From **Settings → Custom fields**, add, edit, or delete fields on Contacts,
Companies, and Deals (the key is fixed after create). Supported types:

- **Text**, **Number**, **Date**, **Select** (single choice), **Checkbox**, **URL**.

New fields appear on the record forms, are validated on write (the same type /
required / select checks as no-code objects — a `url` field rejects a
`javascript:` value), and are returned by the [REST](../api/rest.md) and
[GraphQL](../api/graphql.md) APIs alongside the built-in fields. Manage them
over the API at `/api/custom-fields`. Adding a field as required, or editing a
field's type, select options, or required flag, is refused (`409`) when an
existing record would become invalid under the new definition — fix those
records first, then retry.

## No-code custom objects

Need a whole new object — Projects, Tickets, Subscriptions? Define it from
**Settings → Custom objects** with its own fields. Each type appears in the
sidebar with a list and a detail page. Fourty stores custom objects
**metadata-driven**, with no per-object DDL: adding an object does not run a
schema migration ([ADR-007](../adr/007-custom-objects.md)).

Each custom object gets, for free:

- **A page of its own** — the object joins the sidebar, and
  `/objects/{apiName}` lists its records with create, edit, and delete.
- **Records** validated on write against its field definitions.
- **Notes, tasks, an activity timeline, and the Agent tab** on every record — the same Timeline | Agent switch as contacts.
- **REST endpoints** — `/api/objects/{apiName}` (`q`, `sort`, `limit`) and
  `/api/objects/{apiName}/{id}`.
- **GraphQL** — `records(object, q:, sort:)`, `record(object, id)`,
  `search { records { object data } }`, and
  `createRecord` / `updateRecord` / `deleteRecord`.
- **MCP tools** — `list_custom_objects`, `list_records` (`query`, `sort`),
  `get_record`, `search` (custom-object hits with `object` + `title`),
  `create_record`, `update_record`, `delete_record` so AI clients
  can use them too.
- **⌘K** finds custom-object records the same way it finds contacts.
- The same **RLS + RBAC** as the built-in objects. Per-field hide/freeze
  ([ADR-011](../adr/011-field-level-permissions.md)) applies to Contacts,
  Companies, and Deals — not to no-code object types.

## Definitions over the API

- Object definitions: `GET/POST /api/custom-objects` (+ `/fields`).
- Records: `/api/objects/{apiName}` (see the [REST reference](../api/rest.md)).

From **Settings → Custom objects**, add, edit, or delete fields (the key is
fixed after create). Adding a field as required, or editing a field's type,
select options, or required flag, is refused (`409`) when an existing record
would become invalid under the new definition — fix those records first, then
retry.

## Saved views

Slice any object — built-in or no-code — into reusable **saved views** (search,
sort, columns). **+ Save view** on Contacts, Companies, Deals, Tasks, and every
custom-object list stores the current filters; applying a view restores them.
Manage views at `/api/saved-views`. On Contacts, Companies, and Deals, views
respect field-permissions, so a restricted role never sees a column it
shouldn't. Custom-object views follow the type's field list; object-level
RBAC still applies.

## Related

- **[REST API →](../api/rest.md)** · **[GraphQL API →](../api/graphql.md)**
- **[ADR-007 — Custom objects →](../adr/007-custom-objects.md)**
- **[ADR-011 — Field-level permissions →](../adr/011-field-level-permissions.md)**
