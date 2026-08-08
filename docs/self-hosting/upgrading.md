# Upgrading & migrations

*Schema changes are versioned and reversible. Data imports — from SQLite or Twenty —
are round-trip tested.*

## Upgrading an instance

```bash
git pull
npm install
npm run db:migrate      # apply any new migrations (idempotent)
npm run build && npm start
# restart the worker too:  npm run worker
```

With Docker Compose, `docker compose up --build` re-runs the migration step
automatically before starting the app.

> [!IMPORTANT]
> **New in this release: connected mailboxes pull by themselves.** The worker now
> drains an agent work ledger, and a connected Gmail / Microsoft / ICS account is
> fetched every `AGENT_MAIL_PULL_MINUTES` (default 15) instead of only when
> someone presses **Sync now**. Settings → Mailboxes shows when each account is
> next due.
>
> This is background network traffic that did not happen before, so: it only
> happens where a **worker process is running** (a source install without
> `npm run worker` is unchanged), it only touches mailboxes someone connected,
> and `AGENT_TICK_SECONDS=0` turns the whole agent off while leaving every manual
> path working.

## How migrations work

Fourty uses **drizzle-kit** versioned migrations ([ADR-002](../adr/002-orm-and-migrations.md)),
not a runtime `CREATE TABLE IF NOT EXISTS` bootstrap. Each migration in `drizzle/` has:

- a forward `NNNN_name.sql`,
- a **hand-written** `drizzle/down/NNNN_name.down.sql`, and
- an entry in the journal.

A CI test applies the **full chain up → checksum → down → re-apply** against a real
Postgres and asserts the schema is identical, so every migration is provably
reversible. Migrations run as the **owner** role (`MIGRATE_DATABASE_URL`); the app runs
as the non-owner role so RLS still applies.

> [!WARNING]
> Always back up before a major upgrade — see
> [Operations → Backups](./operations.md#backups). The reversibility test covers schema
> shape, not your data.

## From SQLite

Fourty began as a single-file SQLite app and moved to Postgres for multi-tenancy. Older
SQLite databases migrate **losslessly**:

```bash
npm run db:migrate                                                  # create the Postgres schema
npm run migrate-from-sqlite -- --sqlite ./old/fourty.db --dry-run   # preview counts
npm run migrate-from-sqlite -- --sqlite ./old/fourty.db            # copy data
```

The migration is round-trip tested. Run the `--dry-run` first to see the counts before
anything is written.

## From Twenty

Import companies, people, and opportunities from a Twenty workspace with the
`@fourty/twenty-migrate` CLI:

```bash
npx @fourty/twenty-migrate \
  --twenty-url https://your-twenty.example \
  --twenty-token <twenty-api-token> \
  --fourty-key frty_... \
  --dry-run                 # preview counts without writing
```

Drop `--dry-run` to perform the import. See the package README in
`packages/twenty-migrate/` for the full flag set.

## Next

- **[Operations →](./operations.md)** — backups and monitoring.
