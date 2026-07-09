# Custom fields & objects

*Extend the data model without writing code or running a migration — new fields on
existing objects, or entirely new object types.*

## Custom fields

From **Settings → Custom fields**, add fields to any object (Contacts, Companies,
Deals, …). Supported types:

- **Text**, **Number**, **Date**, **Select** (single choice), **Checkbox**, **URL**.

New fields appear on the record forms, are validated on write, and are returned by the
[REST](../api/rest.md) and [GraphQL](../api/graphql.md) APIs alongside the built-in
fields. Manage them over the API at `/api/custom-fields`.

## No-code custom objects

Need a whole new object — Projects, Tickets, Subscriptions? Define it from Settings
with its own fields. Fourty stores custom objects **metadata-driven**, with no
per-object DDL: adding an object does not run a schema migration
([ADR-007](../adr/007-custom-objects.md)).

Each custom object gets, for free:

- **Records** validated on write against its field definitions.
- **REST endpoints** — `/api/objects/{apiName}` and `/api/objects/{apiName}/{id}`.
- **GraphQL** — `records(object)`, `record(object, id)`, and
  `createRecord` / `updateRecord` / `deleteRecord`.
- **MCP tools** — `list_custom_objects`, `list_records`, `create_record` so AI clients
  can use them too.
- The same **RLS + RBAC + field-permissions** as the built-in objects.

## Definitions over the API

- Object definitions: `GET/POST /api/custom-objects` (+ `/fields`).
- Records: `/api/objects/{apiName}` (see the [REST reference](../api/rest.md)).

## Saved views

Slice any object into reusable **saved views** (filters + sort + columns), managed at
`/api/saved-views`. Views respect field-permissions, so a restricted role never sees a
column it shouldn't.

## Related

- **[REST API →](../api/rest.md)** · **[GraphQL API →](../api/graphql.md)**
- **[ADR-007 — Custom objects →](../adr/007-custom-objects.md)**
