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

## Operations

| Command | What it does |
|---|---|
| `npm run backup-drill` | Verify a Postgres dump restores cleanly. |

## External CLI

| Command | What it does |
|---|---|
| `npx @fourty/twenty-migrate` | Import companies, people, and opportunities from a Twenty workspace. See [Upgrading → From Twenty](../self-hosting/upgrading.md#from-twenty). |

## Related

- **[Installation →](../self-hosting/installation.md)**
- **[Configuration →](../self-hosting/configuration.md)** — the environment variables these commands read.
