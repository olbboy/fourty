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

## Mailbox research: what is read, what is stored, how to switch it off

Once a mailbox is connected, a background pass reads that mailbox to keep contact
records true (`docs/guides/research.md`). It is **on by default** and independent
of any AI setting — it is a parser, not a model.

- **What it reads:** messages and calendar events already synced into your own
  tenant, scoped by RLS to the workspace that owns the mailbox. Contacts are
  matched by exact email address only, never by name.
- **What leaves:** nothing. The pass makes no network calls of any kind — no
  vendor, no model, no telemetry. Fourty ships no phone-home.
- **What is stored:** Fourty does not store message bodies. Signature extraction
  runs at ingest on the in-memory body; what persists is `signature_title`,
  `signature_employer`, `signature_phone` and `signature_raw` (≤500 chars) on
  `email_messages`, alongside the 280-char snippet that was already stored. The
  body is discarded when the sync finishes.
- **What it may change:** only `job_title` and `company_id`, and only when the
  field is empty or still holds this pass's own earlier value. A value a person
  entered is never overwritten — it gets a suggestion instead. Every automatic
  write is audited as `via: "research"` with a null actor, and has one-click
  Revert.
- **How to switch it off:** Settings → Diagnostics → "Read connected mailboxes for
  facts", or `PATCH /api/diagnostics {"keylessResearch": false}`. Off stops the
  reading for the whole workspace at once.

Connecting a mailbox is the consent to process that mail inside the tenant. If
your deployment cannot make that assumption for its users, turn the switch off
before connecting anything.

## Hardening already in place

- **Multi-tenant isolation via Postgres RLS** (FORCE) on all workspace data,
  with a non-owner app role — see posture above.
- Passwords hashed with `scrypt` + per-user salt; constant-time comparison.
- Session tokens and API keys stored only as SHA-256 hashes at rest.
- **Mailbox credentials encrypted at rest** (ADR-019). An OAuth refresh token
  cannot be hashed — Fourty has to send it back to the provider — so the
  credentials in `sync_accounts.config` — including a private **ICS feed URL**,
  which carries its own secret in the path — are encrypted with AES-256-GCM under
  `FOURTY_SECRET_KEY`, which lives in the environment and never in the database.
  **What this buys:** a dump, a backup or a read replica no longer yields usable
  mailbox access. **What it does not:** protection from an attacker who already
  has the running process — they hold the key too. With no key configured,
  connecting a new mailbox is refused rather than stored in the clear; mailboxes
  connected before this existed keep working and are encrypted the next time
  their token refreshes. Back the key up: losing it means reconnecting every
  mailbox. **Rotation:** put the new key in `FOURTY_SECRET_KEY`, the old one in
  `FOURTY_SECRET_KEY_OLD`, restart, run `npm run rekey`, then drop the old key.
  Reads try both keys, so nothing is unreadable while the rewrite runs.
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
