# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Preferred: open a [GitHub private security advisory](https://github.com/olbboy/fourty/security/advisories/new).
- Or email the maintainers with details and, if possible, a proof-of-concept.

We aim to acknowledge reports within **72 hours** and to ship a fix or mitigation
for confirmed high/critical issues as quickly as is safely possible. Please give
us a reasonable window to remediate before public disclosure.

## Scope & current posture (be honest with yourself before deploying)

Fourty is a **single-tenant, single-process** CRM. Understand these properties
before exposing it to untrusted users:

- **No multi-tenancy.** All authenticated principals share one dataset. Do not
  use a single Fourty instance to serve mutually-untrusting organizations.
- **No RBAC enforcement yet.** The `role` column exists but is not enforced; any
  authenticated user (or API key) can perform any operation, including minting
  and revoking API keys. Treat every credential as fully privileged.
- **API keys are unscoped** and grant full read+write. Rotate/revoke promptly if
  leaked (`Settings → API keys`).
- **Transport:** always front Fourty with TLS in production. Session cookies are
  `Secure` unless you explicitly set `FOURTY_INSECURE_COOKIE=1`.

See `CLAIMS.md` and `PROGRESS.md` for the full, evidence-backed gap list.

## Hardening already in place

- Passwords hashed with `scrypt` + per-user salt; constant-time comparison.
- Session tokens and API keys stored only as SHA-256 hashes at rest.
- All write endpoints validate input with zod schemas.
- **Login brute-force rate limiting** (10 attempts / IP / 15 min → HTTP 429).
- **Webhook SSRF protection**: workflow webhook actions cannot reach private /
  loopback / link-local / cloud-metadata addresses unless
  `FOURTY_ALLOW_PRIVATE_WEBHOOKS=1` is set. (Reduces, does not eliminate,
  DNS-rebinding risk — see `src/lib/net.ts`.)
- Dependency audit (`npm audit --audit-level=high`) runs in CI.

## Supported versions

Fourty is pre-1.0. Security fixes target the latest `main` and the current
release branch. Pin a released tag for production and watch for advisories.
