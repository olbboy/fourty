# Operations

*Backups, observability, rate limiting, and the security posture for a production
instance.*

## Backups

Fourty's entire state is in one Postgres database, so backups are ordinary Postgres
backups (`pg_dump` / your managed provider's snapshots). The repo ships a **backup
drill** that verifies a dump can be restored cleanly:

```bash
npm run backup-drill
```

There's also a zero-downtime **expand-migration-under-load** drill in `bench/` for
validating schema changes against live traffic.

## Observability

- **Structured logs** — `pino`, request-scoped with `request_id` and `workspace_id`.
  Set verbosity with `LOG_LEVEL`.
- **Metrics** — a public, PII-free `GET /metrics` Prometheus endpoint: HTTP
  latency/counts, DB-pool gauges, and queue-depth gauges.
- **Tracing** — an optional OpenTelemetry hook, active only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set and the OTel SDK is installed.
- **Health** — `GET /health` for load-balancer probes.

See [Configuration → Observability](./configuration.md#observability).

## Rate limiting

Every API request is rate-limited per caller + IP + route class, with `RateLimit-*`
response headers and `429` on exceed. Limits are tunable
([Configuration](./configuration.md#rate-limiting)).

> [!WARNING]
> The limiter is **in-process**. Behind multiple app replicas each
> instance counts separately — front them with a shared limiter at your gateway for a
> global budget.

## Locked out

With [outbound email](configuration.md#outbound-email) configured, the login page
offers **Forgot your password?** — a one-hour, single-use reset link by email, no
server access needed. Requesting a new link retires the old one, and a completed reset
signs out every session.

Without a mail transport there is nowhere to send the link (the first account on a
fresh install exists before mail does), so reset from the server instead:

```bash
npm run reset-password -- admin@example.com
```

The password is typed at a prompt and never echoed, so it stays out of your shell
history and the process list. Piping it works too, for automation — the confirmation
prompt is skipped when stdin is not a terminal:

```bash
printf '%s' "$NEW_PASSWORD" | npm run reset-password -- admin@example.com
```

Every existing session for that user is signed out, since a reset is usually a response
to a password someone else may know.

Under Compose, run it in the app container:

```bash
docker compose exec app npm run reset-password -- admin@example.com
```

Anyone who can reach the database can do this, which is the same trust boundary as the
server itself — it is not an escalation, but it is a reason to keep server access tight.

## Security posture

- **Multi-tenancy** — Postgres **Row-Level Security** scopes every row to one
  workspace; the app runs as a non-owner role so RLS cannot be bypassed
  ([ADR-001](../adr/001-tenancy-model.md)).
- **AuthZ** — admin / member / viewer **RBAC** ([ADR-005](../adr/005-authz-model.md)),
  optional **field-level permissions** ([ADR-011](../adr/011-field-level-permissions.md)),
  and an **immutable audit log** on every write.
- **API keys** — SHA-256-hashed at rest, revocable, scoped to one workspace and role.
- **2FA** — TOTP + backup codes ([ADR-012](../adr/012-two-factor-auth.md)).
- **Signed webhooks** — per-workspace HMAC-SHA256 ([ADR-013](../adr/013-webhook-signatures.md)).
- **SSO** — OIDC Authorization Code + PKCE, real JWKS/RS256 verification, JIT
  provisioning ([ADR-014](../adr/014-sso-oidc.md)). Providers are managed from
  **Settings → Single sign-on** (admins only); the client secret is write-only —
  the API reports whether one is set and never returns it.
- **SSRF protection** — workflow webhooks can't reach private/loopback addresses unless
  you explicitly opt in.
- **Secure cookies** — enforced unless `FOURTY_INSECURE_COOKIE=1` (demo only).

For the full model and responsible-disclosure policy, see **[SECURITY.md](../../SECURITY.md)**.

## Next

- **[API overview →](../api/overview.md)** — build against your instance.
- **[Architecture →](../architecture.md)** — how it all fits together.
