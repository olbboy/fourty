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

> **Warning.** The limiter is **in-process**. Behind multiple app replicas each
> instance counts separately — front them with a shared limiter at your gateway for a
> global budget.

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
  provisioning ([ADR-014](../adr/014-sso-oidc.md)).
- **SSRF protection** — workflow webhooks can't reach private/loopback addresses unless
  you explicitly opt in.
- **Secure cookies** — enforced unless `FOURTY_INSECURE_COOKIE=1` (demo only).

For the full model and responsible-disclosure policy, see **[SECURITY.md](../../SECURITY.md)**.

## Next

- **[API overview →](../api/overview.md)** — build against your instance.
- **[Architecture →](../architecture.md)** — how it all fits together.
