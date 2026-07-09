# GraphQL API

*A single typed endpoint with introspection — fetch exactly the fields you need,
scoped by the same RLS + RBAC as REST.*

## Endpoint

```
POST /api/graphql
Content-Type: application/json
Authorization: Bearer frty_...

{ "query": "…", "variables": { … } }
```

**Introspection is enabled**, so any GraphQL client (GraphiQL, Apollo, `graphql-request`)
can discover the full schema. The API is built on the reference `graphql` package
([ADR-008](../adr/008-graphql-api.md)) — no extra framework.

## Queries

Typed queries for every object, plus custom-object records:

- `contacts`, `contact(id)`
- `companies`, `deals`, `tasks`, `notes`
- `customObjects`
- `records(object)`, `record(object, id)` — for [custom objects](../guides/custom-objects.md)

## Mutations

- `createContact` / `updateContact` / `deleteContact`
- `createCompany` / `updateCompany` / `deleteCompany`
- `createRecord` / `updateRecord` / `deleteRecord` — for custom objects

## Errors

Unlike REST, GraphQL keeps **HTTP 200** and returns problems in the response body:

```json
{ "errors": [{ "message": "...", "extensions": { "code": "..." } }] }
```

## Example

```bash
curl -X POST https://your-crm.example/api/graphql \
  -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"query":"{ contacts(sort: \"score\") { id firstName score company { name } } }"}'
```

## REST or GraphQL?

Both are first-class and enforce identical governance. Use **REST** for simple CRUD and
scripts; use **GraphQL** when you want to fetch a precise field set in one round trip or
prefer a typed schema. See the [API overview](./overview.md#choosing-an-api).

## Related

- **[Custom fields & objects →](../guides/custom-objects.md)**
- **[REST API →](./rest.md)**
