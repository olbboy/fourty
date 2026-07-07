# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Preferred: open a [GitHub private security advisory](https://github.com/olbboy/fourty/security/advisories/new).
- Or email the maintainers with details and, if possible, a proof-of-concept.

We aim to acknowledge reports within **72 hours** and to ship a fix or mitigation
for confirmed high/critical issues as quickly as is safely possible. Please give
us a reasonable window to remediate before public disclosure.

## Scope & current posture (be honest with yourself before deploying)

Fourty is **multi-tenant on Postgres with Row-Level Security** (Direction B,
Gate B2). Understand these properties before exposing it to untrusted users:

- **Tenant isolation is enforced by Postgres RLS**, not just application code.
  Every workspace-scoped table has an RLS policy keyed on a per-transaction
  `app.workspace_id`; the app connects as a **non-owner role** so the policies
  apply to it (FORCE RLS). A missing app-layer filter fails closed (zero rows),
  not open. This is proven by `tests/tenant-isolation.test.ts` (cross-tenant REST
  → 404, plus a direct-connection RLS proof). Deploy the app as `fourty_app`
  (non-owner) — never as a superuser or the table owner, or RLS is bypassed.
- **RBAC enforcement is not complete (Gate B3).** Membership roles
  (admin/member/viewer) exist but per-action checks are not yet wired, so within
  a workspace any member can currently perform any operation (including minting
  API keys). Treat every credential as workspace-admin-privileged for now.
- **API keys are workspace-scoped** (a key can only ever act in its own
  workspace) but not yet permission-scoped. Rotate/revoke promptly if leaked.
- **Transport:** always front Fourty with TLS in production. Session cookies are
  `Secure` unless you explicitly set `FOURTY_INSECURE_COOKIE=1`.

See `CLAIMS.md`, `PROGRESS.md`, and `docs/adr/001-tenancy-model.md` for detail.

## Hardening already in place

- **Multi-tenant isolation via Postgres RLS** (FORCE) on all workspace data,
  with a non-owner app role — see posture above.
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
