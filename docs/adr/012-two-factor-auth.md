# ADR-012 — Two-factor authentication (TOTP)

**Status:** Accepted · **Date:** 2026-07-08

## Context
Fourty had password + cookie auth only. Twenty's 2.0 auth adds 2FA. We want a
standard, self-hostable second factor that works with any authenticator app and
adds no dependency.

## Decision
**TOTP (RFC 6238) + one-time backup codes, hand-rolled on node:crypto.**

- `src/lib/totp.ts` implements Base32 (RFC 4648), TOTP (HMAC-SHA1, 6 digits, 30s),
  a ±1-step skew window, `otpauth://` provisioning URIs, and backup-code
  generation. **Verified against the RFC 6238 test vector.**
- Three columns on the global `users` table (migration `0009`, reversible):
  `totp_secret`, `totp_enabled`, `backup_codes`. Users is the identity plane — no
  RLS.
- Flow: `POST /api/2fa/setup` stores a **pending** secret + returns the otpauth URI
  → `/api/2fa/enable` verifies the first code, flips `totp_enabled`, and returns
  **10 one-time backup codes stored only as sha256 hashes** → `/api/2fa/disable`
  requires the account password (re-auth).
- **Login** requires a valid TOTP *or* a backup code when 2FA is on; a missing code
  returns `401 { requires2fa: true }` so the client prompts; a used backup code is
  consumed.

### Why not the `otplib`/`speakeasy` packages?
The whole primitive is ~60 lines on `node:crypto` and pins us to no third-party
crypto. Consistent with the zero-dep MCP/GraphQL choices.

## Consequences
- Backup codes are shown exactly once; the server keeps only hashes.
- SSO (OIDC/SAML) and WebAuthn/passkeys remain open — 2FA covers the
  most-requested second factor first.
- Session-based route tests mock `next/headers` cookies (no Next request scope in
  vitest); the crypto is covered by the RFC vector.
