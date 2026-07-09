# Quickstart

*Deploy Fourty and create your first admin account in about 30 seconds.*

## Option A — Docker Compose (recommended)

The Compose stack bundles Postgres, runs the migrations once, and starts both the
app **and** the background worker.

```bash
git clone https://github.com/olbboy/fourty && cd fourty
cp .env.example .env
docker compose up --build
# → http://localhost:3000
```

Open <http://localhost:3000>, create your admin account, and you're in. The first
boot offers demo data so you can explore immediately.

> [!NOTE]
> The Compose demo sets `FOURTY_INSECURE_COOKIE=1` so session cookies work
> over plain `http://localhost`. In production behind TLS, leave it unset — see
> [Configuration](../self-hosting/configuration.md).

## Option B — From source

Requires **Node.js 20+** and **Postgres 16**.

```bash
npm install

# App connects as the non-owner role so Postgres RLS applies; migrations run as owner.
export DATABASE_URL=postgresql://fourty_app:fourty_app@localhost:5432/fourty
export MIGRATE_DATABASE_URL=postgresql://fourty:fourty@localhost:5432/fourty

npm run db:migrate      # apply the schema
npm run dev             # development on :3000
# or production:  npm run build && npm start
```

Run the background worker in a second process so webhooks and workflow actions
execute off the request path:

```bash
npm run worker
```

See [Installation](../self-hosting/installation.md) for the two-role Postgres setup
and production topology.

## First login

On first visit you create the **admin** account. You can seed sample data from the
setup screen, or later from the CLI:

```bash
npm run db:seed         # demo user: demo@fourty.dev / demo1234
```

## Talk to the API

Generate a key in **Settings → API keys**, then:

```bash
curl -H "Authorization: Bearer frty_..." \
  "http://localhost:3000/api/contacts?sort=score"
```

Full reference: **[API overview](../api/overview.md)**.

## Migrating existing data

- **From an older SQLite Fourty:** [Upgrading → From SQLite](../self-hosting/upgrading.md#from-sqlite).
- **From Twenty:** `npx @fourty/twenty-migrate` — see [Upgrading → From Twenty](../self-hosting/upgrading.md#from-twenty).

## Next

- **[Key features →](./key-features.md)** — what to try first.
- **[User guide →](../guides/)** — how each feature works.
