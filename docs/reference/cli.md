# Command reference

*Every `npm run` script, grouped by what you're doing. All commands run from the repo
root.*

## Run the app

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development on `:3000`. |
| `npm run build` | Type-check and compile for production. |
| `npm start` | Start the compiled production server. |
| `npm run worker` | Start the standalone background job worker (drains webhooks + workflow actions). |
| `npm run mcp` | Start the MCP server over stdio (`FOURTY_API_KEY=<key> npm run mcp`). |

## Database & migrations

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply pending schema migrations (runs as the owner role). |
| `npm run db:generate` | Generate a new migration from schema changes (drizzle-kit). |
| `npm run db:seed` | Load demo data (user `demo@fourty.dev` / `demo1234`). |
| `npm run migrate-from-sqlite` | Import an older SQLite Fourty DB — add `-- --sqlite ./old.db [--dry-run]`. |

See [Upgrading & migrations](../self-hosting/upgrading.md).

## Testing

| Command | What it does |
|---|---|
| `npm test` | Run the vitest suite (unit + API + security) against real Postgres. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run test:e2e` | Playwright E2E smoke suite (builds, boots the app, drives Chromium). |
| `npm run db:e2e:setup` | Create the `fourty_e2e` database + `fourty_app` role (once). |
| `npm run db:e2e:reset` | Reset the E2E database between runs. |
| `npm run lint` | Lint with `next lint`. |

The suite defaults to `fourty_test` and `fourty_revtest` on `localhost:5432`. Point
it elsewhere — a different port, say, when 5432 is already taken — with these,
**not** with `DATABASE_URL`:

| Variable | Used by |
|---|---|
| `TEST_DATABASE_URL` | The app/query pool (`fourty_app` role, RLS-subject). |
| `TEST_MIGRATE_DATABASE_URL` | Migrations and truncation (owner role). |
| `REVTEST_DATABASE_URL` | The migration-reversibility test's own database. |

They are deliberately separate from `DATABASE_URL`: the suite truncates
everything it connects to, so a `DATABASE_URL` exported for local development
must never be able to redirect it. Each connection is also refused unless the
database name contains `test`.

## Operations

| Command | What it does |
|---|---|
| `npm run backup-drill` | Verify a Postgres dump restores cleanly. |
| `npm run rekey` | Re-encrypt stored mailbox credentials under the current `FOURTY_SECRET_KEY`. Add `-- --dry-run` to report only. |

### Rotating the encryption key

Mailbox credentials are encrypted at rest ([ADR-019](../adr/019-secrets-at-rest.md)).
Reads try the current key and then every key listed in `FOURTY_SECRET_KEY_OLD`,
so a rotation never has a window where a mailbox is unreadable:

```bash
openssl rand -base64 32                     # 1. the new key
# 2. in .env: move the current FOURTY_SECRET_KEY to FOURTY_SECRET_KEY_OLD,
#    put the new one in FOURTY_SECRET_KEY
# 3. restart the app and the worker — both need both keys
npm run rekey -- --dry-run                  # 4. preview
npm run rekey                               #    then rewrite
# 5. clear FOURTY_SECRET_KEY_OLD and restart again
```

Step 4 reports how many rows moved, so step 5 is a decision rather than a hope.
The command is re-runnable — rows already on the current key are skipped — and
exits non-zero if no key is configured.

It is also how an install that has just set a key for the **first** time
encrypts rows that predate it, instead of waiting for each mailbox's next token
refresh to do it lazily.

## External CLI

| Command | What it does |
|---|---|
| `npx @fourty/twenty-migrate` | Import companies, people, and opportunities from a Twenty workspace. See [Upgrading → From Twenty](../self-hosting/upgrading.md#from-twenty). |

## Related

- **[Installation →](../self-hosting/installation.md)**
- **[Configuration →](../self-hosting/configuration.md)** — the environment variables these commands read.
