# Troubleshooting

*Common issues, what causes them, and the fix. Grouped by symptom.*

> [!TIP]
> Most problems fall into three buckets: the **worker** isn't running, a **security**
> default is doing its job, or the two **Postgres roles** are misconfigured. Check those
> first.

## I can't stay logged in / the login redirects in a loop

Your session cookie is being dropped. Cookies are **Secure-only** unless you opt out, so
over plain HTTP the browser discards them.

- **Behind TLS:** leave `FOURTY_INSECURE_COOKIE` unset (correct for production).
- **On localhost / LAN without TLS:** set `FOURTY_INSECURE_COOKIE=1` (the Compose demo
  does this for you). See [Configuration → Security](./configuration.md#security).

## Workflows and webhooks never fire

Actions are enqueued but nothing drains them — you have no worker.

- Run the worker as its own process: `npm run worker` (Docker Compose starts it for you).
- For a single-process demo only, set `QUEUE_DRIVER=inline` to run jobs in-request.

See [Workflows → The durable queue](../guides/workflows.md#the-durable-queue).

## `permission denied` or empty results from the database

Almost always the **two-role model** ([ADR-001](../adr/001-tenancy-model.md)):

- The **app** must connect as the **non-owner** role (`DATABASE_URL` →
  `fourty_app`) so RLS applies.
- **Migrations** must run as the **owner** role (`MIGRATE_DATABASE_URL` → `fourty`).

If the app connects as the owner, RLS is bypassed; if migrations run as the app role,
they fail on ownership. Check both URLs. See [Configuration → Database](./configuration.md#database).

## Migration fails to apply

- Ensure `MIGRATE_DATABASE_URL` points at the **owner** role.
- Migrations are ordered and journaled — apply them with `npm run db:migrate`, not by
  hand. To reverse, use the paired `down` file.
- Back up before major upgrades; the reversibility test covers schema shape, not data.
  See [Upgrading](./upgrading.md).

## A webhook to my internal service gets blocked

SSRF protection blocks private/loopback/link-local targets by default. To reach an
internal endpoint on a **trusted** network, set `FOURTY_ALLOW_PRIVATE_WEBHOOKS=1`. See
[Webhooks → SSRF protection](../api/webhooks.md#ssrf-protection).

## The AI chat drawer isn't showing

The assistant is **hidden and disabled** until configured. Set `AI_API_KEY` (and
`AI_BASE_URL` / `AI_MODEL` as needed), then restart. See
[AI assistant → Enabling it](../guides/ai-assistant.md#enabling-it).

## `EADDRINUSE` / port already in use

Another process holds the port. Change it with `PORT=3001`, or stop the process using
`:3000`.

## `429 Too Many Requests`

You hit the per-caller rate limit. Back off using the `RateLimit-*` response headers, or
raise the limits ([Configuration → Rate limiting](./configuration.md#rate-limiting)).
Behind multiple replicas, remember the limiter is per-instance —
[front it with a shared gateway limiter](./operations.md#rate-limiting).

## Still stuck?

- Turn up logs with `LOG_LEVEL=debug` and check the request-scoped `request_id` /
  `workspace_id` fields.
- Confirm the app is healthy at `GET /health` and inspect `GET /metrics`.
- Open an issue with the failing request id and relevant log lines.

## Related

- **[Operations →](./operations.md)** · **[Configuration →](./configuration.md)** · **[FAQ →](../guides/faq.md)**
