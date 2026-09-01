# Email & calendar

*Connect a mailbox over read-only OAuth to thread real emails onto your records, and
subscribe to calendars via ICS.*

## Connect a mailbox

From **Settings → Mailboxes & calendars**, connect a **Gmail** or **Microsoft** mailbox over
OAuth (Authorization Code + PKCE, **read-only** scopes — Gmail `gmail.readonly`, Graph
`Mail.Read`). Once connected, Fourty pulls recent mail and:

- **Matches participants to contacts** by email address.
- **Dedupes** messages so re-syncs don't double-post.
- **Threads** each message onto the [activity timeline](./records.md) of the contacts
  and deals it concerns.

## It pulls by itself

Once connected, a mailbox is pulled on a schedule — nobody has to press **Sync now**.
That schedule is not a cron expression: the worker keeps a `mailbox.pull` row in the
agent work ledger for each connected account, due one interval after its last
successful sync. Settings → Mailboxes shows when each one is next due, and the panel
shows a failed sync on the account itself rather than only in a log.

The interval is `AGENT_MAIL_PULL_MINUTES` (default 15). Setting `AGENT_TICK_SECONDS=0`
turns the background agent off entirely; the **Sync now** button still works, and runs
exactly the same code the schedule does.

A pull that keeps failing — an expired refresh token, a feed that stopped answering —
stops after a handful of attempts and says so, on the account and in the task's
outcome. Nothing retries forever in silence.

You can also **push** mail in directly — POST RFC822 or iCalendar payloads to the sync
endpoint — which is how you integrate a provider Fourty doesn't natively OAuth with.

> [!NOTE]
> Mailbox OAuth requires one OAuth app per provider for the whole instance.
> Register it, set the redirect URI to
> `{origin}/api/sync/accounts/{id}/oauth/callback`, and set the credentials in your
> environment — see [Configuration → Mailbox OAuth](../self-hosting/configuration.md#mailbox-oauth).
> Leave the credentials unset to keep those providers disabled; ICS and push
> ingestion still work.

## Calendars via ICS

Calendar sync is via **ICS feed URLs**: subscribe to a calendar's `.ics` link and
Fourty ingests events onto the timeline.

> [!NOTE]
> **Parity note.** Provider *calendar-over-OAuth* (pulling Google/Microsoft calendars
> through their APIs) is deferred — mail OAuth is done, calendar is ICS-based. This is
> one of the honest gaps vs Twenty; see the [comparison table](../../README.md#%EF%B8%8F-how-it-compares) in the README.

## How it's built

The sync **engine** lives in-repo and is transport-injectable
([ADR-009](../adr/009-email-calendar-sync.md)): the matching/dedupe/threading logic is
pure and tested, and the Gmail/Graph transports are pluggable adapters. That's why
push ingestion works without any OAuth app at all.

## Related

- **[Records & timeline →](./records.md)** — where synced mail lands.
- **[Configuration → Mailbox OAuth →](../self-hosting/configuration.md#mailbox-oauth)**
