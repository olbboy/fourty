# ADR-019 — Mailbox credentials are encrypted at rest, with the key outside the database

**Status:** Accepted · **Date:** 2026-08-09

## Context

`sync_accounts.config` holds provider connection details, and for a connected
Google or Microsoft mailbox that includes an **OAuth refresh token** — a
long-lived credential that grants read access to somebody's mail until it is
revoked. It was stored as plaintext JSON.

`SECURITY.md` truthfully said sessions and API keys are hashed at rest. It said
nothing about this, because there was nothing to say. The 2026-08-09 audit
(`CLAIMS.md`) named it: **database read access was mailbox access.** A backup on
a laptop, a read replica, a snapshot shared with a contractor, or an SQL
injection that only *reads* were all enough.

Hashing is not available here — unlike a password or an API key, Fourty has to
send the token back to Google. So the choice is encryption or nothing.

## Decision

Encrypt the credential fields with **AES-256-GCM**, keyed by
**`FOURTY_SECRET_KEY` from the environment**.

### 1. The key lives in the environment, never in the database

A key generated into the `settings` table — the way the webhook signing secret
is — would sit in the same dump as the ciphertext and protect against nothing.
It would make this module a decoration that reads as a security feature, which
is worse than no module at all.

The consequence is accepted and must be documented for operators: **lose the key
and every connected mailbox must be reconnected.** That is the honest price of
the key not being recoverable from the data it protects.

### 2. The threat model, stated narrowly

**Addressed:** a database dump, a backup, a read replica, or any read-only
disclosure of table contents no longer yields usable mailbox credentials.

**Not addressed:** an attacker with the running process. They hold the key, and
they can simply ask the app to sync. Anyone claiming this change defends against
that is overselling it.

### 3. Only credentials are sealed; operational fields stay readable

`accessToken`, `refreshToken`, `password`, `clientSecret`. Not the ICS feed URL
or the IMAP host, so an operator reading a row can still tell *which* mailbox is
misbehaving without holding the key.

**Known gap:** some calendar providers put a token inside the ICS URL. That URL
is deliberately surfaced to the settings UI, so sealing it is a separate change
with its own UI consequences, and is not smuggled in here.

### 4. Fail closed on new secrets; never make an existing install worse

With no key configured:

- a **new** credential is **refused** — connecting a mailbox returns a 400 that
  names the fix, rather than writing a token in the clear;
- a credential **replacing one already stored in the clear** is written in the
  clear, with a warning logged.

The second rule exists because an access token refreshes roughly hourly. Refusing
that write would stop every pre-existing mailbox syncing about an hour after an
upgrade — a silent outage dressed as a security improvement. The plaintext is
already in that row; refusing to rewrite it protects nobody.

Legacy rows are re-sealed automatically the first time anything writes them once
a key exists, so setting the key is the whole migration. There is no data
migration, because a SQL migration cannot hold the key.

### 5. Tampering fails loudly

GCM's tag means a modified or wrong-key value throws instead of decrypting into
something else. A key of the wrong length throws at read time rather than being
padded into something that appears to work.

## Alternatives rejected

| Option | Why rejected |
|---|---|
| Leave it as plaintext, document it | The audit found it precisely because documenting a hole is not closing one. |
| Generate the key into `settings` | Key beside ciphertext. Protects against nothing, looks like it does. |
| Fail closed for everything, including refreshes | Breaks every existing mailbox an hour after upgrade. A security change that causes an outage gets reverted, and then there is no security change. |
| Encrypt the whole `config` blob | Costs the operator the ability to see which feed or host a row is for, and turns a missed decrypt into corrupt JSON instead of a visible `enc:v1:` value. |
| A KMS / external secret manager | A dependency and a service. Fourty's whole claim is one process and one Postgres; an env var is the version of this that a self-hoster will actually configure. |

## Rotation

The envelope carries **no key id**, and does not need one: GCM authenticates, so
a key that is not the one fails its tag rather than returning plausible garbage.
Reads therefore try every configured key — `FOURTY_SECRET_KEY` first, then each
comma-separated entry in `FOURTY_SECRET_KEY_OLD`. Writes only ever use the first.

That asymmetry is the whole design. It means a rotation has **no window in which
anything is unreadable**:

1. generate a new key;
2. move the current one to `FOURTY_SECRET_KEY_OLD`, put the new one in
   `FOURTY_SECRET_KEY`;
3. restart the app and the worker — both now read both, and write the new one;
4. `npm run rekey` (`-- --dry-run` to preview) rewrites what is still on the old
   key, workspace by workspace, inside `withWorkspace()` so RLS scopes it;
5. drop `FOURTY_SECRET_KEY_OLD` and restart.

Step 4 is what makes step 5 safe, and the command reports how many rows it
moved so step 5 is a decision rather than a hope. It is re-runnable: rows
already sealed with the current key are counted and skipped.

The same command is how an install that has *just* set a key for the first time
encrypts rows that predate it, instead of waiting for each mailbox's next token
refresh to do it lazily.

Rejected: putting a key id in the envelope. It would save a failed decryption
attempt or two per read, cost a format version, and require migrating every
existing value — to make a rotation slightly cheaper than it already is.

## Consequences

**Gained**
- A leaked dump no longer leaks mailboxes.
- The threat model is written down and narrow enough to be checkable.

**Cost**
- One more thing to configure, and one more thing to back up. Losing the key
  means reconnecting mailboxes.
- Rotation costs a maintenance step. It is implemented (below), but it is a
  procedure an operator has to run, not something that happens by itself.
