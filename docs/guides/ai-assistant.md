# AI assistant

*An optional in-app chat that reads your CRM and **proposes** writes you confirm. Off
by default; bring your own key; every action runs under your role.*

Fourty ships **no bundled AI** and adds **no heavy SDK**. The assistant is disabled
until you point it at an endpoint — with it off, no CRM data leaves the box, and
`docker compose up` is unchanged.

## What it does

Open the chat drawer and ask about your CRM in **English or Vietnamese**. The agent:

- **Reads** data using the same tools as the [MCP server](../api/mcp.md).
- **Proposes** writes and waits for you to **confirm** before anything runs — it never
  writes on its own (a "stop-at-write" loop, [ADR-015](../adr/015-ai-agent-chat.md)).
- **Streams** replies token by token.

Every tool call runs **under your role** — RBAC + RLS + field-permissions, identical
to REST/MCP — and every confirmed write lands in the **immutable audit log**, tagged
so you can tell AI-assisted changes apart.

## Enabling it

Point `AI_API_KEY` at any **OpenAI-compatible** endpoint and set the model:

```bash
AI_BASE_URL=https://api.openai.com/v1   # or Groq, OpenRouter, a local .../v1
AI_API_KEY=sk-...                       # unset = chat hidden + route disabled
AI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=1024                       # primary cost guardrail
AI_RATELIMIT_PER_HOUR=60                 # per-user budget
```

Tool-calling is tested against OpenAI / Groq / OpenRouter; local **Ollama / LM Studio**
are best-effort (the agent degrades to a text-only assistant if the model emits no
tool calls). Full details in [Configuration](../self-hosting/configuration.md#ai-assistant).

## Two separate AI surfaces

Fourty has two independent, off-by-default AI features — don't confuse them:

| | **AI assistant** (this page) | **AI-draft workflow action** |
|---|---|---|
| ADR | [015](../adr/015-ai-agent-chat.md) | [016](../adr/016-ai-native-strategy.md) (Tier 3) |
| Surface | Interactive chat drawer | A [workflow](./workflows.md) action |
| Enabled by | `AI_API_KEY` | `FOURTY_ENABLE_AI=1` + a provider key |
| Providers | OpenAI-compatible | Anthropic / OpenAI / local Ollama |
| Output | Proposed writes you confirm | A **draft note** for review — never a record edit |

Both inherit the same guardrails: governance through the real tools, human-in-the-loop
on writes, `via` audit tagging.

## Design principles

The whole approach — be the safest substrate for *your* AI rather than a bundled
agent platform — is recorded in **[ADR-016](../adr/016-ai-native-strategy.md)**.

## Related

- **[MCP server →](../api/mcp.md)** — the same tools, for external LLM clients.
- **[Configuration → AI →](../self-hosting/configuration.md#ai-assistant)**
