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
  here). `POST …/run` implements the `ics` feed-URL pull with the existing
  SSRF guard. OAuth/IMAP/Gmail/Microsoft fetch plugs in at this seam and calls the
  same engine; **those network transports are not exercised by the test suite**,
  which is stated plainly rather than mocked into a green checkmark.

## Consequences
- Idempotent ingestion is at-least-once-delivery friendly (fits the Gate B4 queue).
- Account `config` may hold secrets (IMAP password, OAuth token ref); the API
  **redacts** them on read and only surfaces non-secret hints (host/url).
- Full provider OAuth flows + historical backfill are a later tier; the data model
  and engine are built to receive them.
