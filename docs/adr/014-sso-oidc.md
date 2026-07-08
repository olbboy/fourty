# ADR-014 — Single sign-on (OIDC Authorization Code + PKCE)

**Status:** Accepted · **Date:** 2026-07-08

## Context
Fourty had password + optional TOTP auth only. Twenty 2.0 offers SSO. We want a
self-hostable, standards-based SSO that works with any OpenID Connect provider
(Okta, Auth0, Entra ID, Keycloak, Google) without a heavy client library, and
that stays testable without a live identity provider.

## Decision
**OIDC Authorization Code flow with PKCE, hand-rolled on `node:crypto` + WHATWG
URL, with the network as an injectable edge.**

- `src/lib/sso/oidc.ts` — the pure protocol core: discovery
  (`/.well-known/openid-configuration`, with an issuer-match check), PKCE S256,
  the authorize URL, and the token-endpoint exchange. Every network call takes an
  `HttpFetcher` (`src/lib/sso/http.ts`), so the whole flow is exercised against a
  fake IdP in tests. The default fetcher is TLS-only (plaintext http allowed only
  to loopback, for a dev IdP).
- `src/lib/sso/jwt.ts` — **real ID-token verification**: RS256 signature against
  the provider JWKS via `createPublicKey({format:"jwk"})` + `crypto.verify`, then
  `iss` / `aud` / `exp` (±60s skew) / `nonce` claim checks. Not a back-channel
  "trust the token endpoint" shortcut — the signature is checked. Verified against
  a locally-generated RSA keypair in `tests/sso.test.ts`.
- Two global tables (migration `0010`, reversible): `sso_connections` (an
  instance-level provider: issuer + client credentials + default workspace/role)
  and `sso_login_states` (the one-time `state` → PKCE verifier + nonce + bound
  redirect, deleted on callback). Both live on the **identity plane** (like
  `users`/`sessions`) — no `workspace_id`, no RLS — because OIDC login runs before
  a workspace is selected.
- Flow: `GET /api/auth/sso/[id]/start` mints state+PKCE+nonce and 302s to the IdP
  → `GET /api/auth/sso/[id]/callback` validates the single-use state, exchanges
  the code, verifies the ID token, then **JIT-provisions** the user (find-or-create
  by verified email; SSO-only users get an unusable random password hash), joins
  them to the connection's default workspace, and issues the session cookie.
- Admin CRUD at `/api/sso/connections[/id]` — `sso` is an administration object
  (admin-only, `redactConnection` never returns the client secret).

### Why not `openid-client` / `passport`?
The flow is ~200 lines on `node:crypto` + `URL`, and it pins us to no third-party
auth stack — consistent with the zero-dep TOTP (D2), webhook HMAC (D3), MCP and
GraphQL choices. Discovery/JWKS caching and SAML are deliberately deferred (YAGNI).

## Consequences
- **Instance-global providers, not per-workspace.** Login precedes workspace
  selection, so a connection is instance-level. In a multi-workspace deployment
  any workspace admin can manage SSO for the whole instance — a known limitation,
  stated honestly; a `workspace_id` scope column is a forward-compatible add.
- Client secrets are stored plaintext in `sso_connections` (like IMAP passwords in
  `sync_accounts.config`) and redacted on read. Encrypting secrets at rest is a
  follow-up.
- SAML and provider-side logout (RP-initiated logout / back-channel) remain open;
  OIDC covers the most-requested SSO first.
- The same injectable-transport edge is the natural home for the still-open
  **provider OAuth for mail/calendar** (C6): a token acquired here can feed the
  ingestion engine.
