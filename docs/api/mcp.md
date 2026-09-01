# MCP server

*Expose Fourty to Claude, Cursor, and other LLM clients over the Model Context
Protocol — 39 tools, on stdio or HTTP, every call scoped by workspace and role.*

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

## Tools (39)

**Read:** `search`, `get_contact`, `get_company`, `get_deal`, `list_contacts`,
`list_companies`, `list_deals`, `list_tasks`, `get_task`, `list_assignees`,
`get_dashboard_stats`, `get_report_stats`, `list_pipelines`, `get_pipeline`,
`list_custom_objects`, `list_records`, `get_record` (plus pinned `taskIds` / `noteIds` / `activityIds`), `list_fact_suggestions`,
`list_notes`, `list_activities`.

> [!TIP]
> **Walk the graph, don't search twice.** `get_contact` / `get_company` / `get_deal` /
> `get_task` / `get_record` return the record *plus the ids around it* — a contact's company, deals,
> colleagues, pinned tasks, notes and timeline; a company's contacts, deals, pinned tasks, notes and timeline; a deal's
> company, contacts, pinned tasks, notes, timeline and stage clock; a custom-object record's pinned work; a task's parent record. `search` is **exact or prefix only**, deliberately: a fuzzy match that
> returns "Marchetta" for "Marchetti" gives a caller no way to tell a near-miss from
> a hit. Surname-only and company-domain prefixes work. An empty result says so rather
> than ending the conversation.
>
> A tool whose capability is not configured in the workspace returns
> `{ ok: false, configured: false, reason }` instead of throwing — a configuration
> gap is not a failure, and retrying will not fix it.

**Write:** `create_contact`, `update_contact`, `delete_contact`, `create_company`,
`update_company`, `delete_company`, `create_deal`, `update_deal`, `delete_deal`,
`create_task`, `update_task`, `delete_task` (pin `entityType` to a contact, company, deal, or custom-object apiName),
`create_note` (contact, company, deal, or a custom-object apiName),
`log_activity` (email, call, or meeting on a record's timeline),
`create_record`, `update_record`, `delete_record`, `record_fact`, `decide_fact`.

> [!IMPORTANT]
> **Write safety.** Every tool carries a `mutates` flag, and the **delete** tools are
> **dry-run by default** — pass `confirm: true` to actually delete. Created/updated
> deals come back with a [health score](../guides/lead-scoring.md#deal-health).
>
> `record_fact` takes **no score and no confidence** — you report what you observed,
> from a closed set of evidence kinds, and a pure function prices it. MCP is
> class C ([ADR-018](../adr/018-evidence-and-research.md)): the band is priced
> honestly (it may be VERIFIED) but the field is never written — it stays a
> [suggestion for a human](../guides/suggestions.md) until they accept. The
> in-app assistant marks `via: "ai"` (class A) and caps a model-chosen
> observation at *probable*.

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
