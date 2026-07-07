<div align="center">

# Fourty

**The open-source CRM that deploys in 30 seconds.**

Twice the CRM, half the complexity. One process, one file database, zero infrastructure.

</div>

---

> **Project status (read before deploying).** Fourty is mid-migration to a
> **Postgres multi-tenant** architecture ("Direction B", see [`docs/adr/`](./docs/adr)).
> **Done:** the app now runs on **Postgres** with versioned, reversible
> drizzle-kit migrations, a real-Postgres CI, and a one-command Docker Compose
> stack (Gate B1). **Not done yet:** multi-tenancy + row-level security (the next
> gate), enforced RBAC, SSO, and an MCP server — so today it is still effectively
> **single-tenant** and *not* an enterprise Twenty replacement. Existing SQLite
> users migrate with `npm run migrate-from-sqlite` (round-trip tested). For the
> evidence-backed detail see [`CLAIMS.md`](./CLAIMS.md), [`PARITY.md`](./PARITY.md),
> [`PROGRESS.md`](./PROGRESS.md), and [`SECURITY.md`](./SECURITY.md). Every claim is
> cross-checked there against code and passing tests.

## Why Fourty?

Fourty aims to be the fastest open-source CRM to stand up and the easiest to run — a small, legible codebase (~8k LOC) with strong built-in analytics and lead scoring. It runs on **Postgres** with a one-command Docker Compose stack:

```bash
git clone https://github.com/olbboy/fourty && cd fourty
cp .env.example .env && docker compose up --build
# → http://localhost:3000 — create your admin account, done.
```

Compose brings up Postgres, runs the migrations once, and starts the app. No
Redis and no separate queue server yet — the workflow engine runs in-process
(a background worker lands in a later milestone; see [`docs/adr/004`](./docs/adr/004-queue-and-workers.md)).

> _Historical note: Fourty began as a single-file SQLite app. It moved to
> Postgres to enable multi-tenancy and scale (Direction B). Older SQLite
> databases migrate losslessly with `npm run migrate-from-sqlite`._

### How it compares

| | **Fourty** | Twenty | Salesforce |
|---|---|---|---|
| Deploy | Docker Compose (Postgres) | Postgres + Redis + workers | Cloud only |
| Built-in analytics | Forecast, funnel, velocity, win/loss, aging, sources | Basic | Extensive ($$) |
| Lead scoring | ✅ Automatic, zero-config | ❌ | Einstein ($$) |
| Workflow automation | ✅ Visual builder, in-process, instant | Limited | Flow ($$) |
| Multi-currency deals | ✅ 12 currencies, auto USD-normalized reporting | ❌ | ✅ |
| Mobile | ✅ Responsive PWA + bottom nav | ❌ No mobile app | ✅ |
| Custom fields | ✅ UI-managed, instant in forms & API | ✅ | ✅ |
| CSV import | ✅ Fuzzy header mapping + company auto-linking | Basic | ✅ |
| REST API | ✅ Every resource, Bearer-token keys | GraphQL-first | ✅ |
| Command palette | ✅ ⌘K global search & jump | ✅ | ❌ |
| License | MIT | AGPL | Proprietary |

_This table is a **small-team lens**: it compares out-of-the-box experience for
one team, not enterprise-platform parity. Twenty 2.0 leads on multi-tenancy,
custom objects, an apps/SDK platform, GraphQL, field-level RBAC, and a native
MCP server — see [`PARITY.md`](./PARITY.md) for the honest, cited matrix._

## Features

- **Contacts, Companies, Deals, Tasks, Notes** — with polymorphic activity timelines on every record.
- **Kanban pipeline** — drag deals between stages; per-column totals and weighted forecasts update optimistically. List view included.
- **Automatic lead scoring** — every contact gets a live 0–100 score from profile fit, engagement recency, and commercial signals. Hot leads surface on the dashboard; the model is a pure function you can tune in one file (`src/lib/scoring.ts`).
- **Analytics that answer real questions** — open pipeline, probability-weighted forecast, 90-day win rate, average sales cycle, revenue trend, funnel by stage, win/loss by month, lead-source conversion, pipeline aging, stale-deal alerts.
- **Workflow automation** — "When a deal is won → create an onboarding task and add a note." Visual builder with conditions, template variables (`{{firstName}}`), five action types (task, note, field update, webhook, log), and a full run history. Runs synchronously in-process: no queue, no cron, no lost jobs.
- **Multi-currency** — deals in USD, EUR, GBP, JPY, VND and 7 more; every report normalizes to USD automatically.
- **Custom fields** — add text/number/date/select/checkbox/URL fields to any object from Settings; they appear in forms, detail pages, and the API immediately.
- **CSV import/export** — imports match `First Name`/`first_name`/`firstname` alike, dedupe by email, and link or auto-create companies from a `company` column.
- **⌘K command palette** — search contacts, companies, and deals or jump to any page without touching the mouse.
- **REST API + API keys** — everything the UI does, over JSON. Keys are SHA-256-hashed at rest and revocable.
- **Dark mode & PWA** — theme follows your OS (with manual toggle); installable on mobile with a native-feeling bottom nav.
- **Self-initializing** — first boot creates the schema and a default 7-stage pipeline; the setup screen offers demo data so you can explore instantly.

## Quickstart

**Fastest — Docker Compose** (bundles Postgres, runs migrations, starts the app):

```bash
cp .env.example .env
docker compose up --build      # → http://localhost:3000
```

**From source** — requires Node.js 20+ and Postgres 16:

```bash
npm install
export DATABASE_URL=postgresql://user:pass@localhost:5432/fourty
npm run db:migrate             # apply schema
npm run dev                    # development on :3000
# or production:  npm run build && npm start
```

On first visit you'll create the admin account (optionally with sample data).

**Demo seed (optional):**

```bash
npm run db:seed    # demo user: demo@fourty.dev / demo1234
```

**Migrating from an older SQLite Fourty:**

```bash
npm run db:migrate                                   # create the Postgres schema
npm run migrate-from-sqlite -- --sqlite ./old/fourty.db --dry-run   # preview
npm run migrate-from-sqlite -- --sqlite ./old/fourty.db            # copy data
```

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://fourty:fourty@localhost:5432/fourty` | Postgres connection string |
| `PGPOOL_MAX` | `10` | Connection pool size per process |
| `FOURTY_INSECURE_COOKIE` | unset | Set to `1` to allow session cookies over plain HTTP (behind a VPN/LAN or the local Compose demo) |
| `FOURTY_ALLOW_PRIVATE_WEBHOOKS` | unset | Set to `1` to let workflow webhooks reach private/loopback addresses (off = SSRF-blocked) |
| `PORT` | `3000` | HTTP port |

## REST API

Generate a key in **Settings → API keys**, then:

```bash
# List hot leads, highest score first
curl -H "Authorization: Bearer frty_..." \
  "https://your-crm.example/api/contacts?sort=score"

# Create a deal (lands in the first stage of the default pipeline)
curl -X POST -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"name":"Enterprise rollout","amount":320000,"currency":"EUR"}' \
  https://your-crm.example/api/deals

# Move it through the pipeline (fires deal.stage_changed / deal.won workflows)
curl -X PATCH -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"stageId":"<stage-id>"}' https://your-crm.example/api/deals/<id>

# Dashboard stats as JSON — pipe your CRM into anything
curl -H "Authorization: Bearer frty_..." https://your-crm.example/api/stats/dashboard
```

Resources: `contacts`, `companies`, `deals`, `pipelines`, `tasks`, `notes`, `activities`, `workflows`, `custom-fields`, `search`, `stats/dashboard`, `stats/reports`, `export/{contacts,companies,deals}`, `import/contacts`. All support the same JSON shapes the UI uses; validation errors come back as `400 {"error": "field: message"}`.

### Outbound webhooks

Add a **webhook action** to any workflow and Fourty POSTs the full entity snapshot to your URL on every trigger — the escape hatch that connects Fourty to n8n, Zapier, Slack, or your own services without waiting for a marketplace.

## Architecture

```
src/
  app/            Next.js App Router — pages + REST API routes
  components/     UI primitives, charts, panels (no component library)
  db/             Drizzle (pg-core) schema, migrations, seed
  lib/
    scoring.ts    lead-score model (pure, tested)
    currency.ts   multi-currency conversion + formatting
    csv.ts        RFC-4180 parser/serializer (dependency-free)
    workflows/    event → conditions → actions engine (pure core, tested)
    services/     stats aggregation, score recompute
drizzle/          versioned SQL migrations (up + hand-written down)
scripts/          migrate-from-sqlite tool
tests/            vitest — 60 tests, run against real Postgres in CI
```

Deliberate choices (see [`docs/adr/`](./docs/adr) for full rationale + trade-offs):

- **Postgres + drizzle-kit migrations** — enables the multi-tenancy, RLS, and
  concurrency that Direction B targets. Versioned, reversible migrations replace
  the old runtime `CREATE TABLE IF NOT EXISTS` bootstrap.
- **In-process workflows (for now)** — actions run in the request path today; a
  Postgres-backed background queue (pg-boss) with retry/backoff moves them off
  the request cycle in a later milestone (ADR-004).
- **No component library** — the whole UI is ~40 small components on Tailwind; nothing to fork a theme from.

## Testing

```bash
npm run db:migrate   # apply schema to $DATABASE_URL (a test Postgres)
npm test             # vitest: unit + API integration + security, on real Postgres
npm run build        # type-checks and compiles
```

## License

MIT — use it, fork it, sell it, self-host it for your team. No open-core gotchas.
