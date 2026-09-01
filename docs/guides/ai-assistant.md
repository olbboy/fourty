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

Zhipu **GLM** works as that same OpenAI-compatible client. Set `GLM_API_KEY` (or
`ZAI_API_KEY`) instead of `AI_API_KEY` and the defaults become
`https://open.bigmodel.cn/api/paas/v4` + `glm-4.5-flash`. The request sends
`thinking: { type: "disabled" }` so GLM-4.5 does not spend the token cap on
hidden chain-of-thought (the chat would otherwise finish a tool call with no
spoken reply). Override with `AI_BASE_URL` / `AI_MODEL` if you use a coding-plan
host (`https://api.z.ai/api/coding/paas/v4`) or another model id. `AI_API_KEY`
still wins when both are set.

Tool-calling is tested against OpenAI / Groq / OpenRouter; local **Ollama / LM Studio**
are best-effort (the agent degrades to a text-only assistant if the model emits no
tool calls). Full details in [Configuration](../self-hosting/configuration.md#ai-assistant).

## What it knows about your install

Before it plans anything, the assistant is told two things about the workspace it is
pointed at — so it stops proposing steps that depend on an integration you never
connected, and stops turning that into a thrown error mid-conversation.

**Who you are.** One line, at most 320 characters, set in **Settings → Diagnostics**:
what you sell and to whom. It opens the prompt, so write it like an introduction to a
new rep.

**What it can reach.** A per-workspace capability list, also shown read-only in
**Settings → Diagnostics**:

| Capability | Configured from | What it gives the assistant |
|---|---|---|
| **AI assistant** | `AI_API_KEY` in the environment | The chat itself and any model-backed pass |
| **Mailbox sync** | Settings → Mailboxes | Threads, replies and signature blocks |
| **Calendar** | Settings → Mailboxes (an ICS feed) | Meeting attendance |
| **Outbound webhooks** | Settings → Webhooks; Workflows → a webhook action | Notifying other systems |
| **Custom objects** | Settings → Custom objects | Extra record types it may read |

Everything except the API key is a **per-workspace row**, not an environment variable:
changing what the assistant can see never needs a redeploy. Anything not configured is
named in the prompt as *not set up here*, so the assistant says so instead of failing at
a tool call. On an install with nothing connected the list is not an apology — everything
the assistant can learn is already in the CRM.

Diagnostics is admin-only and renders booleans and labels only: never a key, not even a
redacted one.

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

## The Agent tab on a record

Every contact, company, deal, and **custom-object record** has a **Timeline | Agent** switch. The Agent tab
is a conversation *about that record* — it already knows which one, so you do not
paste an id or a name into your question. The record travels as an id the server
re-checks against your own workspace and role; it is never spliced into your
message text. The prompt lists adjacent ids (company, deals, pinned tasks) so
the assistant can walk the graph without a second search.

- **Your threads are yours.** Two reps asking about the same contact are having
  two conversations. Old threads stay in the picker; the open one is in the URL,
  so a link opens the conversation you were reading.
- **The transcript is stored, not remembered.** Reload, switch tabs, come back
  tomorrow — it is still there. Leaving the tab never cancels an answer in
  flight.
- **The composer says what is actually true.** *Working* means a reply is in
  flight (a slow provider can take a minute or more; the stream sends heartbeats
  so the tab does not look dead). *Ended* is permanent and offers a new
  conversation. *Offline* means we could not reach a provider — a fact about the
  install, not about your thread. They are never used interchangeably.

**With no AI provider configured the tab is still worth opening.** The composer
says so plainly. On **contacts and companies**, below it sits *What research found*
— every suggestion and every auto-filled field on this record, with the evidence
behind each. That half is produced by the [keyless research pass](./research.md)
and needs no model at all. Deals and custom-object records have no facts inbox,
so that block is omitted.

Background work — what the agent has queued about this record and why — stays
where it has always been, in the left-hand column, visible whichever tab you are
on.

## Design principles

The whole approach — be the safest substrate for *your* AI rather than a bundled
agent platform — is recorded in **[ADR-016](../adr/016-ai-native-strategy.md)**.

## Related

- **[MCP server →](../api/mcp.md)** — the same tools, for external LLM clients.
- **[Configuration → AI →](../self-hosting/configuration.md#ai-assistant)**
