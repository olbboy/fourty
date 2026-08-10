# Security Policy

## Supported Versions

| Version | Supported          |
|---------|-------------------|
| 2.x     | ✅ Active          |
| 1.x     | ⚠️ Critical fixes only |
| < 1.0   | ❌ End of life     |

Security fixes target the latest release on `main`. Pin a released tag for production and watch for advisories.

## Reporting a Vulnerability

Please report security issues **privately** — do not open a public issue.

- **Preferred**: Open a [GitHub private security advisory](https://github.com/olbboy/fourty/security/advisories/new).
- **Alternative**: Email the maintainers with details and, if possible, a proof-of-concept.

We aim to:
- **Acknowledge** reports within **72 hours**
- **Ship a fix** for confirmed high/critical issues as quickly as is safely possible

Please give us a reasonable window to remediate before public disclosure.

## Security Posture

Fourty runs on a **Postgres multi-tenant** architecture. Understand these properties before exposing it to untrusted users:

### Multi-Tenant Isolation (Postgres RLS)

- **Tenant isolation is enforced by Postgres RLS**, not just application code. Every workspace-scoped table has an RLS policy keyed on a per-transaction `app.workspace_id`.
- The app connects as a **non-owner role** so policies apply (FORCE RLS). A missing app-layer filter fails closed (zero rows), not open.
- Proven by `tests/tenant-isolation.test.ts` (cross-tenant REST → 404, plus a direct-connection RLS proof).
- **Deploy the app as `fourty_app`** (non-owner) — never as a superuser or the table owner, or RLS is bypassed.

### Authentication & Access Control

- **RBAC**: Membership roles (admin / member / viewer) with per-action checks on every mutating route.
- **API keys**: Workspace-scoped (a key can only act in its own workspace).
- **2FA**: TOTP-based two-factor authentication (RFC 6238).
- **SSO**: OpenID Connect (Authorization Code + PKCE, JWKS/RS256 ID-token verification).
- **Transport**: Always front Fourty with TLS in production. Session cookies are `Secure` unless you explicitly set `FOURTY_INSECURE_COOKIE=1`.

### Data Protection

- Passwords hashed with `scrypt` + per-user salt; constant-time comparison.
- Session tokens and API keys stored only as SHA-256 hashes at rest.
- **Mailbox credentials encrypted at rest** (AES-256-GCM) under `FOURTY_SECRET_KEY`. A database dump no longer yields usable mailbox access.
- Key rotation: Put the new key in `FOURTY_SECRET_KEY`, the old one in `FOURTY_SECRET_KEY_OLD`, restart, run `npm run rekey`, then drop the old key.

### Mailbox Research Privacy

Once a mailbox is connected, a background pass reads it to keep contact records true. Key properties:

- **What it reads**: Messages and calendar events scoped by RLS to the owning workspace.
- **What leaves**: Nothing. No vendor calls, no model calls, no telemetry.
- **What is stored**: Signature data only (≤500 chars) — message bodies are discarded after ingest.
- **What it may change**: Only `job_title` and `company_id`, and only when the field is empty. A human's value is never overwritten.
- **How to switch it off**: Settings → Diagnostics → "Read connected mailboxes for facts", or `PATCH /api/diagnostics {"keylessResearch": false}`.

### Hardening

- All write endpoints validate input with Zod schemas.
- **Login brute-force rate limiting**: 10 attempts / IP / 15 min → HTTP 429.
- **Webhook SSRF protection**: Workflow webhook actions cannot reach private / loopback / link-local / cloud-metadata addresses unless `FOURTY_ALLOW_PRIVATE_WEBHOOKS=1` is set.
- **Immutable audit log**: Database-enforced (REVOKE + rules) — the app role cannot UPDATE or DELETE audit entries.
- Dependency audit (`npm audit --audit-level=high`) runs in CI.

## Disclosure Policy

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). We will:

1. Confirm the issue and determine its impact
2. Develop and test a fix
3. Release a patch with a security advisory
4. Credit the reporter (unless they prefer anonymity)
