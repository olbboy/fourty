# Webhooks

*Push CRM events to n8n, Zapier, Slack, or your own services — signed, and safe against
SSRF by default.*

## Sending events

Add a **webhook action** to any [workflow](../guides/workflows.md). When the workflow's
trigger fires, Fourty `POST`s the **full entity snapshot** to your URL. This is the
escape hatch that connects Fourty to anything without waiting for a marketplace.

Because webhook delivery runs on the [durable queue](../adr/004-queue-and-workers.md),
it inherits **retry with exponential backoff**, **dead-lettering** for endpoints that
stay down, and **exactly-once** semantics via the idempotency ledger — you won't get a
double-fired webhook from a retry.

## Verifying signatures

Each delivery is signed with a **per-workspace HMAC-SHA256**
([ADR-013](../adr/013-webhook-signatures.md)). Verify the signature header against the
raw request body using your workspace's signing secret before trusting a payload — this
is how you know the POST really came from your Fourty instance.

## SSRF protection

By default, workflow webhooks **cannot reach private, loopback, or link-local
addresses** — Fourty blocks them to prevent server-side request forgery. To target an
internal service (a self-hosted n8n, a localhost sidecar), opt in explicitly:

```bash
FOURTY_ALLOW_PRIVATE_WEBHOOKS=1
```

> **Warning.** Only enable this on a trusted network. It lets workflow authors reach
> internal addresses from the server. See
> [Configuration → Security](../self-hosting/configuration.md#security).

## Managing endpoints

Webhook configuration is available over `/api/webhooks` and in the workflow builder.

## Related

- **[Workflows →](../guides/workflows.md)** — where webhooks are configured.
- **[ADR-013 — Signed webhooks →](../adr/013-webhook-signatures.md)**
