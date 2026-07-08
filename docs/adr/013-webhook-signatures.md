# ADR-013 — Signed webhooks

**Status:** Accepted · **Date:** 2026-07-08

## Context
Webhooks were durable (Gate B4) but **unsigned** — a receiver couldn't verify a
payload really came from Fourty or reject a replay. This was the standing gap in
the extensibility matrix ("signature TBD").

## Decision
**Per-workspace HMAC-SHA256 signature + timestamp header (Stripe/GitHub style).**

- `src/lib/webhook-sign.ts`: `sign(secret, ts, body)` = hex HMAC-SHA256 of
  `"<ts>.<body>"`. Outbound requests carry `X-Fourty-Signature: sha256=<hex>` and
  `X-Fourty-Timestamp: <ms>`. `verifyWebhookSignature()` is timing-safe and rejects
  timestamps outside a 5-minute window (replay protection). Exposed for consumers.
- The **signing secret is per-workspace**, stored in `settings` (RLS-scoped),
  lazily created on first send and rotatable. Admin `GET/POST /api/webhooks/secret`
  reads/rotates it.
- The signature is computed **in the engine** (which has the workspace context and
  the payload) and **carried on the queue job**, so a retry resends the *same*
  signed request; the worker just sets the headers. Signing before enqueue keeps
  the worker free of workspace lookups.

## Consequences
- Signing over `"<ts>.<body>"` (not the body alone) binds the timestamp, so a
  captured signature can't be replayed with a new timestamp.
- Rotating the secret invalidates in-flight signatures older than the window —
  acceptable; document to rotate during a quiet period.
- Payload encryption / mTLS to receivers is out of scope; signing covers
  authenticity + integrity + replay, which is what webhook receivers check.
