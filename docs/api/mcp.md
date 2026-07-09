# MCP server

*Expose Fourty to Claude, Cursor, and other LLM clients over the Model Context
Protocol — 20 tools, on stdio or HTTP, every call scoped by workspace and role.*

Fourty ships a **hand-rolled, dependency-free** MCP server ([ADR-010](../adr/010-mcp-server.md))
— no SDK, consistent with the ~10-dependency ethos. It's the centerpiece of Fourty's
[AI-native strategy](../adr/016-ai-native-strategy.md): be the safest substrate for
*your* AI rather than a bundled agent platform.

## Two transports

| Transport | How | For |
|---|---|---|
| **stdio** | `FOURTY_API_KEY=<key> npm run mcp` | Local clients — Claude Desktop, Cursor. |
| **HTTP** | `POST /api/mcp` with `Authorization: Bearer <key>` and a JSON-RPC body (single message or a batch array) | Hosted / remote MCP clients. |

Both serve the same JSON-RPC methods and enforce the same governance. Where Twenty ties
MCP to Cloud/OAuth, Fourty's HTTP transport runs on the OSS build.

### Claude Desktop config

```json
"fourty": {
  "command": "npm",
  "args": ["run", "mcp"],
  "env": { "FOURTY_API_KEY": "frty_..." }
}
```

## Methods

`initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`,
`prompts/list`, `prompts/get`, `ping`.

## Tools (20)

**Read:** `search`, `list_contacts`, `list_companies`, `list_deals`, `list_tasks`,
`get_dashboard_stats`, `list_custom_objects`, `list_records`.

**Write:** `create_contact`, `update_contact`, `delete_contact`, `create_company`,
`update_company`, `delete_company`, `create_deal`, `update_deal`, `delete_deal`,
`create_task`, `create_note`, `create_record`.

> **Write safety.** Every tool carries a `mutates` flag, and the **delete** tools are
> **dry-run by default** — pass `confirm: true` to actually delete. Created/updated
> deals come back with a [health score](../guides/lead-scoring.md#deal-health).

## Resources & prompts

- **Resources** — `fourty://dashboard`, `fourty://custom-objects`: read-only CRM context
  an LLM can pull without a tool call (routed through the same tool handlers, so RLS +
  RBAC still apply — not a bypass door).
- **Prompts** — `summarize_pipeline`, `draft_followup`: reusable prompt templates. These
  return message text only; Fourty runs no model itself.

## Governance

Every tool, resource, and prompt runs under the key's **workspace (RLS)** and **role
(RBAC)**, with **field-level permissions** applied — identical to REST and GraphQL. The
HTTP transport is not a privileged path.

## Related

- **[AI assistant →](../guides/ai-assistant.md)** — the in-app chat that uses these tools.
- **[ADR-016 — AI-native strategy →](../adr/016-ai-native-strategy.md)**
