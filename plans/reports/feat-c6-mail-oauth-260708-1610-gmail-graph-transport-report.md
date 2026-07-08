# C6 completion — Google/Microsoft mail OAuth transport — report

Date: 2026-07-08 · Branch: main · Status: DONE (verified) · Uncommitted

## Scope (confirmed with user)
- **Mail-only** now; calendar-over-OAuth deferred (provider calendar APIs return
  JSON not ICS → new ingest path; ICS feed URL already covers calendar).
- **Env per-instance** OAuth client creds (client = the app, not the user).
- Both providers: Google (Gmail) + Microsoft (Graph).

Completes C6's "injectable transport edge" — the ingestion engine (parse→match→
link→dedupe) shipped earlier; this adds the OAuth fetch that feeds it. No migration
(tokens live in `sync_accounts.config` JSON, already redacted).

## Changes
- `src/lib/sync/oauth.ts` — provider configs (Gmail readonly / Graph Mail.Read +
  offline_access), PKCE S256, `buildConsentUrl` (offline+consent), `exchangeCode`,
  `refreshAccessToken`, `clientFromEnv`. Injectable `HttpFetcher`.
- `src/lib/sync/http.ts` — the injectable transport seam (`syncFetcher` /
  `__setSyncFetcher`), mirrors the SSO edge, kept local (no sync→auth dep).
- `src/lib/sync/fetch-mail.ts` — Gmail (`list` → `format=raw` base64url decode) +
  Graph (`list` → `/$value` MIME) → **raw RFC822**, fed to existing `ingestEmails`.
- `src/lib/sync/transport.ts` — `getValidAccessToken` (refresh + persist on expiry,
  preserves refresh token) + `runMailSync`.
- Routes: `…/connect` (consent redirect, PKCE+state in httpOnly cookie),
  `…/oauth/callback` (verify state, exchange, store tokens), and `…/run` extended
  for google/microsoft. `authorize(sync:update)` on all; GET so no static-guard
  change needed.
- `sync_accounts` redactor adds a `connected` hint (never leaks tokens).
- `.env.example` — GOOGLE_/MICROSOFT_OAUTH_CLIENT_ID/SECRET (commented, optional).
- Tests: +9 in `sync.test.ts` — consent URLs, exchange/refresh grants, Gmail+Graph
  fetch, full run→refresh→fetch→ingest→link, connect cookie, callback stores
  tokens, CSRF state mismatch rejected.
- Docs: ADR-009 update, PARITY/PROGRESS/README refresh.

## Verification
- `npx vitest run` → **185/185 pass** (176 → +9).
- `npm run build` → green; connect/oauth-callback/run routes registered.

## Design notes
- Provider network is the injectable edge; boundary-tested vs a fake provider (no
  live account), consistent with ADR-009's honesty stance.
- CSRF: `${accountId}:${state}:${verifier}` in an httpOnly cookie; callback decodes
  (cookie serialization percent-encodes `:`) and checks account+state before
  exchanging. PKCE verifier travels in the same cookie.
- OAuth tokens stored plaintext in config + redacted on read (same as IMAP
  passwords); at-rest encryption still the deferred follow-up (per user's Q2).

## Unresolved questions
- Scheduling: `…/run` is manual/trigger-driven. A periodic worker job (pg-boss) to
  auto-pull on an interval is a natural follow-up — build now or defer?
- Calendar-over-OAuth (JSON→event adapter) if/when needed.
