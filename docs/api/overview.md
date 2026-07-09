# API overview

*Authentication, keys, error shapes, and rate limits — the rules that apply to every
Fourty API.*

## Authentication

Every request carries a **workspace API key** as a bearer token:

```
Authorization: Bearer frty_...
```

A key belongs to **exactly one workspace** and acts at a **fixed role**
(admin / member / viewer). Create and revoke keys in **Settings → API keys**, or over
`/api/api-keys`. Keys are **SHA-256-hashed at rest** — the plaintext is shown once at
creation and never stored.

## What a key can do

A key is scoped by the same three layers as a logged-in user:

1. **Row-Level Security** — it only ever sees rows in its own workspace.
2. **RBAC** — its role gates writes; a `viewer` key gets `403` on a write.
3. **Field-level permissions** — hidden or frozen fields are hidden or frozen for it too.

Every write it performs lands in the **immutable audit log**.

## Error shapes

| Situation | Response |
|---|---|
| Validation failure | `400 { "error": "field: message" }` (zod) |
| Missing / bad key | `401` |
| Role not permitted | `403` |
| Unknown record, or a record in another workspace | `404` (RLS makes them indistinguishable) |
| Rate limit exceeded | `429` with `RateLimit-*` headers |

GraphQL is the exception: its errors travel in the response body
(`errors[]` with `extensions.code`) and HTTP stays `200` — see the
[GraphQL reference](./graphql.md).

## Rate limiting

Requests are limited per caller + IP + route class (read / write / bulk). Responses
carry `RateLimit-*` headers so you can back off gracefully. Limits are tunable — see
[Configuration → Rate limiting](../self-hosting/configuration.md#rate-limiting).

## Choosing an API

| Use | Reach for |
|---|---|
| Simple CRUD, scripts, curl | **[REST](./rest.md)** |
| Typed queries, fetch exactly the fields you need | **[GraphQL](./graphql.md)** |
| An LLM agent (Claude, Cursor) acting on the CRM | **[MCP](./mcp.md)** |
| Pushing events out to other systems | **[Webhooks](./webhooks.md)** |

## Next

- **[REST API →](./rest.md)**
