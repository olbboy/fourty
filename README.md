<div align="center">

# Fourty

**The open-source CRM that deploys in 30 seconds.**

Twice the CRM, half the complexity. One process, one file database, zero infrastructure.

</div>

---

> **Project status (read before deploying).** Fourty is a **single-team,
> single-tenant** CRM — one shared dataset, one Node process. It is *not* a
> multi-tenant / enterprise Twenty replacement today: there is no multi-tenancy,
> no enforced RBAC, no SSO, and no MCP server yet. For an evidence-backed audit
> of exactly what is and isn't implemented, see
> [`CLAIMS.md`](./CLAIMS.md), the head-to-head [`PARITY.md`](./PARITY.md) vs
> Twenty 2.0, the roadmap in [`PROGRESS.md`](./PROGRESS.md), and
> [`SECURITY.md`](./SECURITY.md). Every claim here is cross-checked there against
> code and passing tests.

## Why Fourty?

Most open-source CRMs make you pay an *ops tax* before you manage a single contact: a Postgres server, a Redis instance, a heavyweight monorepo, and a docker-compose file long enough to need its own code review. Fourty takes the opposite bet:

```bash
git clone https://github.com/olbboy/fourty && cd fourty
npm install && npm run build && npm start
# → http://localhost:3000 — create your admin account, done.
```

That's the whole deployment. SQLite (WAL mode) handles teams of dozens with ease, the workflow engine runs in-process with no queue server, and the entire app is a single Node process you can run on a $4 VPS, a Raspberry Pi, or a container platform.

### How it compares

| | **Fourty** | Twenty | Salesforce |
|---|---|---|---|
| Deploy | 1 process, SQLite | Postgres + Redis + workers | Cloud only |
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

**Requirements:** Node.js 20+.

```bash
npm install
npm run dev        # development on :3000
# or production:
npm run build && npm start
```

On first visit you'll create the admin account (optionally with sample data).

**Demo seed (optional):**

```bash
npm run db:seed    # demo user: demo@fourty.dev / demo1234
```

**Docker:**

```bash
docker build -t fourty .
docker run -p 3000:3000 -v fourty-data:/app/data fourty
```

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `FOURTY_DB_PATH` | `./data/fourty.db` | SQLite location (`:memory:` for tests) |
| `FOURTY_INSECURE_COOKIE` | unset | Set to `1` to allow session cookies over plain HTTP in production (behind a VPN, LAN, etc.) |
| `PORT` | `3000` | HTTP port (`next start -p`) |

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
  db/             Drizzle schema, self-bootstrapping DDL, seed
  lib/
    scoring.ts    lead-score model (pure, tested)
    currency.ts   multi-currency conversion + formatting
    csv.ts        RFC-4180 parser/serializer (dependency-free)
    workflows/    event → conditions → actions engine (pure core, tested)
    services/     stats aggregation, score recompute
tests/            vitest — 33 tests over the pure logic
```

Deliberate choices:

- **SQLite over Postgres** — a CRM for a 5–50-person team is thousands of rows, not billions. WAL-mode SQLite gives single-digit-ms queries, trivial backups (`cp fourty.db backup.db`), and removes an entire class of ops failures. The data layer is Drizzle ORM, so a Postgres driver can be swapped in when you truly outgrow it.
- **Synchronous workflows** — actions run in the same transaction context as the triggering request. No broker, no retries-of-retries; webhook calls are the only fire-and-forget part.
- **No component library** — the whole UI is ~40 small components on Tailwind; nothing to fork a theme from.

## Testing

```bash
npm test          # vitest: scoring, CSV, currency, workflow conditions, engine integration
npm run build     # type-checks and compiles
```

## License

MIT — use it, fork it, sell it, self-host it for your team. No open-core gotchas.
