# Gate D4 — SSO / OIDC — completion report

Date: 2026-07-08 · Branch: main · Status: DONE (verified)

## Scope
OIDC Authorization Code flow + PKCE login for Fourty, with discovery / token
exchange / JWKS as an injectable HTTP edge (tested at the boundary vs a fake IdP,
mirroring C6's transport design). SAML + provider OAuth for mail/calendar remain
out of scope (see PARITY/PROGRESS).

## What shipped
- **Schema + migration** `0010_sso_oidc` (reversible): `sso_connections` (global
  OIDC providers) + `sso_login_states` (one-time PKCE/nonce/redirect). Global
  identity plane — no `workspace_id`, no RLS (login precedes workspace selection).
  `fourty_app` DML inherited from the 0002 ALTER DEFAULT PRIVILEGES.
- **Lib** `src/lib/sso/`: `http.ts` (injectable `HttpFetcher`, TLS-only default +
  loopback carve-out, `__setSsoFetcher` test seam); `oidc.ts` (discovery w/ issuer
  check, PKCE S256, authorize URL, code exchange, JWKS fetch); `jwt.ts` (RS256
  verify via `createPublicKey({format:"jwk"})` + `crypto.verify`, iss/aud/exp/nonce
  checks); `provision.ts` (find-or-create user by verified email, JIT membership);
  `connection-view.ts` (secret-redacting serializer).
- **Routes**: `GET /api/auth/sso/[id]/start` + `/callback` (public, pre-session);
  admin CRUD `GET/POST /api/sso/connections`, `GET/PATCH/DELETE
  /api/sso/connections/[id]` (RBAC object `sso`, admin-only).
- **UI**: login page renders enabled providers as `btn-ghost` links + an
  `sso_error` banner.
- **RBAC**: `sso` added to `ADMIN_OBJECTS` in `src/lib/permissions.ts`.
- **Tests** `tests/sso.test.ts` (15): RS256/JWKS (valid / tampered / wrong-key /
  claim checks); OIDC core (PKCE, authorize URL, discovery issuer-mismatch, code
  grant body); full start→callback flow (JIT provision + membership + session,
  single-use state, expired state, nonce mismatch, unverified email, existing-email
  link). Updated `tests/api-auth.test.ts` (2 public routes) and
  `tests/migration-reversibility.test.ts` (28→30 tables, policies unchanged).
- **Docs**: ADR-014 + index; PARITY/PROGRESS/README refreshed.

## Verification
- `npx vitest run` → **174/174 pass** (was 159; +15 SSO).
- `npm run build` → green; the 4 SSO routes registered.
- Reversibility: full chain up→down→up identical; 30 tables / 23 policies.
- `next lint` is not configured in this repo (interactive prompt) — the build's
  tsc pass is the static gate.

## Deliberate decisions
- **Instance-global providers, not per-workspace** — login runs before a
  workspace exists (matches the global users/sessions plane). Known limitation:
  any workspace admin can manage instance SSO; a `workspace_id` scope is a
  forward-compatible add. Stated in ADR-014.
- **Real ID-token verification (JWKS/RS256)**, not a back-channel trust shortcut —
  honest per the project's ethos; zero-dep on node:crypto.
- Client secrets stored plaintext + redacted on read (like `sync_accounts`
  passwords); at-rest encryption is a follow-up.

## Unresolved questions
- Per-workspace SSO (domain routing) — needed, or is instance-global sufficient
  for the target self-host deployments?
- Encrypt `client_secret` at rest now, or defer with the sync-account secrets as
  one pass?
- Next Tier-3 target: enforce field-perms on GraphQL/MCP (D1 follow-up), SAML, or
  provider OAuth transport for C6?
