# Workflows & automation

*"When a deal is won → create an onboarding task and add a note." Build that in the
visual editor; run it on a durable queue that never drops a job.*

## Anatomy of a workflow

A workflow is **trigger → conditions → actions**:

1. **Trigger** — a CRM event, e.g. `deal.won`, `deal.stage_changed`, `contact.created`.
2. **Conditions** *(optional)* — only run when the record matches (e.g. amount > 50000).
3. **Actions** — one or more of the five types below.

Build it in the **visual builder**, with **template variables** like `{{firstName}}`
that interpolate the triggering record into text.

## Action types

| Action | Effect |
|---|---|
| **Create task** | Add a to-do, optionally assigned and dated. |
| **Add note** | Pin a note (with template variables) to the record. |
| **Update field** | Set a field on the triggering record. |
| **Webhook** | POST the full entity snapshot to your URL — see [Webhooks](../api/webhooks.md). |
| **Log** | Write an entry to the run history. |
| **AI draft** *(optional)* | Enqueue a generative **draft note** for a human to review — off unless AI is enabled; see [AI assistant](./ai-assistant.md). |

## The durable queue

Actions do **not** run inside the request that triggered them. They're enqueued onto a
**Postgres-backed job queue** ([pg-boss](../adr/004-queue-and-workers.md) — no Redis)
and drained by the background **worker** (`npm run worker`). That buys you:

- **Retry with exponential backoff** and a **dead-letter queue** for poison jobs.
- **Exactly-once side effects** via an idempotency ledger — no double-fired webhooks.
- **Survival across restarts** — a crash mid-run doesn't lose the job.

> [!WARNING]
> In production, run the worker as its own process (Docker Compose does
> this for you). Without a worker, jobs queue but never execute — unless you set
> `QUEUE_DRIVER=inline`, which runs them in-request (fine for a single-process demo,
> not for production). See [Configuration](../self-hosting/configuration.md).

## Run history

Every workflow keeps a full **run history** — which trigger fired, which conditions
matched, and the outcome of each action — so automation is auditable, not magic.

## Related

- **[Webhooks →](../api/webhooks.md)** — connect to n8n, Zapier, Slack.
- **[AI assistant →](./ai-assistant.md)** — the optional AI-draft action.
