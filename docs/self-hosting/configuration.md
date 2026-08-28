# Configuration

*Every runtime setting lives in the environment — no secrets are hardcoded. Copy
`.env.example` to `.env` and adjust.*

Only `DATABASE_URL` / `MIGRATE_DATABASE_URL` are required; everything else has a safe
default. Optional variables are commented out in `.env.example`.

## Database

The app connects as a **non-owner** role so Postgres RLS applies; migrations and the
queue's own schema run as the **owner** ([ADR-001](../adr/001-tenancy-model.md)).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://fourty_app:fourty_app@localhost:5432/fourty` | App runtime connection (non-owner role — RLS applies). |
| `MIGRATE_DATABASE_URL` | `postgresql://fourty:fourty@localhost:5432/fourty` | Migrations (owner role). |
| `POSTGRES_PASSWORD` | `fourty` | Password for the bundled Compose Postgres. |
| `FOURTY_APP_PASSWORD` | `fourty_app` | Password for the `fourty_app` runtime role. |
| `PGPOOL_MAX` | `10` | Connection-pool size per app/worker process. |

## Queue and worker

pg-boss manages its own `pgboss` schema, so it connects as the owner role
([ADR-004](../adr/004-queue-and-workers.md)).

| Variable | Default | Purpose |
|---|---|---|
| `QUEUE_DATABASE_URL` | falls back to `MIGRATE_DATABASE_URL` | Connection for the job queue (owner role). |
| `QUEUE_DRIVER` | `pgboss` (prod), `inline` (tests) | `pgboss` = durable, needs a running worker. `inline` = run jobs in-request, single-process only. |

### Background agent

The worker also drains the **agent work ledger** (`agent_tasks`): a table of what
the background agent intends to do about a record, when, and why. Connected
mailboxes are pulled from here, so no cron is involved — the row is the schedule.

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_TICK_SECONDS` | `60` | How often the worker asks each workspace to look at its queue. `0` disables the agent entirely. |
| `AGENT_MAIL_PULL_MINUTES` | `15` | How long after its last sync a connected mailbox is pulled again. |
| `AGENT_LEASE_MS` | `300000` | How long a claimed task is held before another worker may take it. A killed worker's tasks come back when the lease expires. |
| `AGENT_DIRECT_BATCH` | `60` | Deterministic tasks claimed per tick (parse, fetch, derive — no model). |
| `AGENT_SESSION_BATCH` | `12` | Model-backed tasks claimed per tick. Never scheduled at all without an AI provider. |

## Observability

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` | pino level: `trace`…`fatal`, `silent`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Optional OTLP/HTTP tracing collector. No-op unless set **and** the OTel SDK is installed. |

## Rate limiting

Per caller + IP + route class, in-process. Behind multiple replicas these are
per-instance — front them with a shared gateway limiter.

| Variable | Default | Purpose |
|---|---|---|
| `RATELIMIT_WINDOW_MS` | `60000` | Window length (ms). |
| `RATELIMIT_READ` | `600` | Read requests per window. |
| `RATELIMIT_WRITE` | `300` | Write requests per window. |
| `RATELIMIT_BULK` | `60` | Bulk (import/export) requests per window. |

## HTTP

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `NODE_ENV` | `production` | Node environment. |

## Security

| Variable | Default | Purpose |
|---|---|---|
| `FOURTY_INSECURE_COOKIE` | unset | Set to `1` to allow session cookies over plain HTTP (LAN/VPN or the local demo). **Behind TLS in production, leave unset** so cookies are Secure-only. |
| `FOURTY_ALLOW_PRIVATE_WEBHOOKS` | unset | Set to `1` to let workflow webhooks reach private/loopback/link-local addresses. **Leave unset in production** — Fourty blocks these by default to prevent SSRF. |

## Mailbox OAuth

One OAuth app per provider for the whole instance. Register the app, set the redirect
URI to `{origin}/api/sync/accounts/{id}/oauth/callback`, and paste the credentials.
Read-only scopes: Gmail `gmail.readonly` · Graph `Mail.Read` + `offline_access`. Leave
unset to keep a provider disabled (ICS + push ingestion still work). See
[Email & calendar](../guides/email-calendar.md).

| Variable | Purpose |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Gmail mailbox OAuth. |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | Microsoft Graph mailbox OAuth. |

Once the instance credentials are set, individual mailboxes are added and connected
from **Settings → Mailboxes & calendars**, which also runs a pull on demand, pauses a
mailbox, and disconnects one.

## Outbound email

Fourty sends one kind of message: the member invite. **Disabled unless `SMTP_HOST`,
`SMTP_USER` and `SMTP_PASSWORD` are all set** — with it off, **Settings → Team
members** shows the accept link for an admin to pass along by hand, which is the only
behaviour that existed before. Set them and inviting a teammate emails them the link
instead; the panel still shows it, in case the mail doesn't arrive.

| Variable | Purpose |
|---|---|
| `SMTP_HOST` | Mail server hostname. All three of host/user/password are required. |
| `SMTP_PORT` | Default `465`. |
| `SMTP_USER` | Usually the full address of the sending mailbox. |
| `SMTP_PASSWORD` | Password or app-specific password for that mailbox. |
| `SMTP_SECURE` | `1` for implicit TLS, `0` for STARTTLS. Inferred from the port; set it only when a server disagrees with its own port number. |
| `MAIL_FROM` | `From:` header. Defaults to `SMTP_USER`; many servers reject an address they don't own. |

Both the app and the worker need these: the worker drains the `mail.send` queue and
does the sending, while the app reads them only to decide whether an invite can be
emailed. Sends are queued, so a mail server that is down gets retried with backoff
rather than failing the invite — the invite itself is committed either way.

Prefer the mailbox that already sends for your domain. Its SPF and DKIM records
already cover it, so nothing about the domain's DNS changes; a separate mail provider
means updating SPF before anything you send is trusted.

| Provider | Host and port | Password to use |
|---|---|---|
| Lark Mail | `smtp.larksuite.com:465` | A *dedicated password* from the Lark **desktop** app: avatar → Settings → Email → Third-party email client login → Set Up Now. An admin has to allow third-party email clients first, and mailing-list addresses can't sign in this way. |
| Google Workspace | `smtp.gmail.com:465` | An App Password (account needs 2FA). |
| Microsoft 365 | `smtp-mail.outlook.com:587` | Account or app password. |

## AI assistant

The optional in-app chat ([ADR-015](../adr/015-ai-agent-chat.md)). **Disabled entirely
when `AI_API_KEY` is unset** — route and UI both hidden. See
[AI assistant](../guides/ai-assistant.md).

| Variable | Default | Purpose |
|---|---|---|
| `AI_API_KEY` | unset | OpenAI-compatible key. **Unset = AI chat disabled.** |
| `AI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, local `…/v1`). |
| `AI_MODEL` | `gpt-4o-mini` | Model id sent to the endpoint. |
| `AI_MAX_TOKENS` | `1024` | Cap per completion — the primary cost guardrail. |
| `AI_RATELIMIT_PER_HOUR` | `60` | Chat turns per user per hour (every role); `429` when exceeded. |

## Generative drafts (Tier 3)

A **separate**, off-by-default adapter for the workflow "AI draft" action
([ADR-016](../adr/016-ai-native-strategy.md)), namespaced `FOURTY_AI_*` so it never
collides with the chat above. Output is always a **draft note** for review — it never
edits records. With it off, no CRM data leaves the box; use the `ollama` provider to
keep everything on a local model.

| Variable | Default | Purpose |
|---|---|---|
| `FOURTY_ENABLE_AI` | unset | Set to `1` to enable the AI-draft action. |
| `FOURTY_AI_PROVIDER` | — | `anthropic` \| `openai` \| `ollama`. |
| `FOURTY_AI_MODEL` | per-provider default | Optional model override. |
| `FOURTY_AI_MAX_TOKENS` | `1024` | Cap per draft. |
| `ANTHROPIC_API_KEY` | — | Key for `FOURTY_AI_PROVIDER=anthropic`. |
| `OPENAI_API_KEY` | — | Key for `FOURTY_AI_PROVIDER=openai`. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint for `FOURTY_AI_PROVIDER=ollama` (local). |

## Next

- **[Operations →](./operations.md)** — run it safely.
- **[Upgrading →](./upgrading.md)** — migrate the schema and import data.
