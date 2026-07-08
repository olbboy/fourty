# ADR-009 — Email & calendar sync

**Status:** Accepted · **Date:** 2026-07-08

## Context
Twenty syncs mailboxes and calendars and threads them onto records. Fourty had
none. A full OAuth/IMAP integration can't be exercised in CI (no real accounts),
so the risk is shipping a fake. We want a genuinely runnable, tested pipeline and
an honest boundary at the network transport.

## Decision
**Split the transport from the ingestion engine; implement + test the engine.**

- Three tenant-scoped tables (migration `0007`): `sync_accounts` (a connected
  mailbox/calendar), `email_messages`, `calendar_events`. Messages/events dedupe
  on their provider id (RFC 822 `Message-ID` / iCal `UID`) via a **unique
  `(workspace, account, provider-id)` index**.
- The **ingestion engine** (`src/lib/sync`) is fully in-repo and tested:
  1. real **RFC 822** and **iCalendar (VEVENT)** parsers,
  2. participant-email → contact matching within the workspace (RLS),
  3. `INSERT … ON CONFLICT DO NOTHING` dedup (idempotent — safe to re-run),
  4. logs an `email` / `meeting` activity on the linked contact and bumps
     `last_activity_at`, so synced items appear on the existing timeline.
- The **transport is the injectable edge**. `POST /api/sync/accounts/[id]/ingest`
  accepts raw messages/ICS (a mail webhook, the worker, or an IMAP poller pushes
  here). `POST …/run` pulls live: `ics` fetches the feed URL (SSRF-guarded); every
  provider network call routes through an injectable `HttpFetcher`
  (`src/lib/sync/http.ts`).

## Update (mail OAuth transport built)
The **Google + Microsoft mail transport** is now implemented (`src/lib/sync/`):
- `oauth.ts` — Authorization Code + PKCE, offline access, `exchangeCode` /
  `refreshAccessToken`. One OAuth app **per provider via env** (client = the app,
  not the user); only the resulting tokens are stored, on `sync_accounts.config`.
- `fetch-mail.ts` — Gmail (`format=raw`) and Graph (`/$value`) return **raw
  RFC822**, which feeds the existing `ingestEmails` engine with no new parser.
- Connect flow: `…/connect` → provider consent (state + PKCE in an httpOnly
  cookie) → `…/oauth/callback` stores tokens; `…/run` refreshes and pulls.
- **Tested at the boundary** against a fake provider (`sync.test.ts`): consent URL,
  code exchange/refresh, Gmail/Graph fetch, and a full run → ingest → contact-link.
- **Calendar over OAuth is deferred**: provider calendar APIs return JSON (not
  ICS), needing a new ingest path — calendar is covered today by the `ics` feed
  URL. SAML-style/IMAP transports remain the same injectable seam.

## Consequences
- Idempotent ingestion is at-least-once-delivery friendly (fits the Gate B4 queue).
- Account `config` holds secrets (IMAP password, **OAuth tokens**); the API
  **redacts** them on read and only surfaces non-secret hints (host/url/`connected`).
  Encrypting these at rest is a follow-up.
- Historical backfill + provider push/watch subscriptions are a later tier; the
  data model and engine are built to receive them.
