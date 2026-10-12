# API & developers

CRM records and the settings the UI uses are available over REST, authenticated with a
workspace API key and governed by the same RLS + RBAC + field-permissions as the app.
GraphQL and MCP cover the CRM record surface (not admin routes).

- **[Overview](./overview.md)** — authentication, API keys, error shapes, rate limiting.
- **[REST API](./rest.md)** — every resource, over JSON.
- **[GraphQL API](./graphql.md)** — the typed `POST /api/graphql` endpoint.
- **[MCP server](./mcp.md)** — expose Fourty to Claude, Cursor, and other LLM clients.
- **[Webhooks](./webhooks.md)** — outbound events, signed with HMAC.

> [!IMPORTANT]
> **One governance path.** REST, GraphQL, and MCP are three front doors onto the same
> service layer. A role that can't see a field in the UI can't see it through any of
> them — there is no privileged bypass.

Machine-readable summary for LLMs: **[`/llms.txt`](../../public/llms.txt)**.
