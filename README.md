<div align="center">

# Fourty

**The open-source CRM that deploys in 30 seconds.**

Twice the CRM, half the complexity. One process, one Postgres, zero infrastructure.

[Documentation](./docs/) · [Quickstart](./docs/getting-started/quickstart.md) · [Why Fourty](./docs/getting-started/why-fourty.md) · [API](./docs/api/) · [Parity vs Twenty](./PARITY.md)

</div>

---

> [!IMPORTANT]
> **Project status (read before deploying).** Fourty runs on a **Postgres
> multi-tenant** architecture. **Done:** versioned reversible migrations + real-PG CI,
> multi-tenancy with **Row-Level Security**, object-level **RBAC** + field-level
> permissions + immutable audit log, a **durable queue/worker**, custom objects, a
> typed **GraphQL API**, saved views, i18n + a11y, email/calendar ingestion with
> Google/Microsoft **mail OAuth**, a native **MCP server** (stdio + HTTP), the
> **`@fourty/twenty-migrate`** CLI, **2FA/TOTP**, **signed webhooks**, **SSO via
> OIDC**, and an optional in-app **AI assistant**. **Not done yet:** **SAML**, a
> define-as-code apps/SDK platform, and **calendar-over-OAuth** (mail OAuth is done;
> calendar is via ICS feeds) — so it is not yet a drop-in enterprise Twenty
> replacement. Every claim is cross-checked against code and tests in
> [`CLAIMS.md`](./CLAIMS.md), [`PARITY.md`](./PARITY.md), [`PROGRESS.md`](./PROGRESS.md),
> and [`SECURITY.md`](./SECURITY.md).

## Why Fourty?

Most open-source CRMs make you operate a distributed system before you can add a
contact. Fourty is a **single Next.js process and one Postgres** — no Redis, no broker,
~10 runtime dependencies — that still ships forecasting, lead scoring, workflow
automation, a REST **and** GraphQL API, and a native MCP server for AI agents.

```bash
git clone https://github.com/olbboy/fourty && cd fourty
cp .env.example .env && docker compose up --build
# → http://localhost:3000 — create your admin account, done.
```

Compose brings up Postgres, runs the migrations once, then starts the app **and a
background worker** that drains jobs from a Postgres-backed queue (pg-boss — no Redis)
with retry, backoff, and dead-lettering.

Read the full rationale in **[Why Fourty](./docs/getting-started/why-fourty.md)**.

### How it compares

|  | **Fourty** | Twenty | Salesforce |
|---|---|---|---|
| Deploy | Docker Compose (Postgres + worker) | Postgres + Redis + workers | Cloud only |
| Built-in analytics | Forecast, funnel, velocity, win/loss, aging, sources | Basic | Extensive ($$) |
| Lead scoring | ✅ Automatic, zero-config | ❌ ("coming soon") | Einstein ($$) |
| Workflow automation | ✅ Visual builder, durable queue | Limited | Flow ($$) |
| REST **and** GraphQL API | ✅ Both | GraphQL-first | ✅ |
| MCP server (AI agents) | ✅ Self-host, 20 tools, stdio + HTTP | ✅ (Cloud/OAuth) | ❌ |
| License | **MIT** | AGPL | Proprietary |

_A **small-team lens** — out-of-the-box experience for one team, not full
enterprise-platform parity. Twenty 2.0 still leads on SAML, an apps/SDK platform, and
calendar-over-OAuth. See the honest, cited matrix in [`PARITY.md`](./PARITY.md)._

## Features at a glance

- **Core CRM** — Contacts, Companies, Deals, Tasks, Notes, each with a polymorphic activity timeline. → [guide](./docs/guides/records.md)
- **Kanban pipeline** — drag deals between stages; weighted forecast + multi-currency (12 currencies, auto-USD). → [guide](./docs/guides/pipeline.md)
- **Deterministic intelligence** — automatic 0–100 lead scoring and deal health, pure functions you can tune. → [guide](./docs/guides/lead-scoring.md)
- **Analytics** — forecast, win rate, sales cycle, funnel, win/loss, source conversion, aging, stale-deal alerts. → [guide](./docs/guides/analytics.md)
- **Workflow automation** — visual builder on a durable Postgres queue; five action types + run history. → [guide](./docs/guides/workflows.md)
- **Custom fields & no-code objects** — extend the data model, served over REST, GraphQL, and MCP. → [guide](./docs/guides/custom-objects.md)
- **APIs** — [REST](./docs/api/rest.md), typed [GraphQL](./docs/api/graphql.md), a native [MCP server](./docs/api/mcp.md), and signed [webhooks](./docs/api/webhooks.md).
- **Optional AI assistant** — BYO-key in-app chat that reads your CRM and proposes writes you confirm; off by default. → [guide](./docs/guides/ai-assistant.md)
- **Platform** — RLS multi-tenancy, RBAC + field permissions, immutable audit log, 2FA, SSO (OIDC), i18n, PWA, ⌘K palette.

Full tour: **[Key features](./docs/getting-started/key-features.md)**.

## 📚 Documentation

| | |
|---|---|
| 🚀 **[Get started](./docs/getting-started/)** | Why Fourty, a 30-second deploy, and a full feature tour. |
| 📖 **[User guide](./docs/guides/)** | Records, pipeline, scoring, analytics, workflows, custom objects, AI. |
| 🐳 **[Self-hosting](./docs/self-hosting/)** | Install, configure, upgrade, and operate your instance. |
| 🔌 **[API & developers](./docs/api/)** | REST, GraphQL, the MCP server, webhooks. |
| 🏛 **[Architecture](./docs/architecture.md)** | How Fourty is built, plus [16 decision records](./docs/adr/). |

## Quickstart

**Docker Compose** (bundles Postgres, runs migrations, starts app + worker):

```bash
cp .env.example .env
docker compose up --build      # → http://localhost:3000
```

**From source** (Node.js 20+ and Postgres 16):

```bash
npm install
export DATABASE_URL=postgresql://fourty_app:fourty_app@localhost:5432/fourty
export MIGRATE_DATABASE_URL=postgresql://fourty:fourty@localhost:5432/fourty
npm run db:migrate            # apply schema
npm run dev                   # or: npm run build && npm start
npm run worker                # in a second process
```

Details, the two-role Postgres model, and production topology:
**[Installation](./docs/self-hosting/installation.md)** ·
**[Configuration](./docs/self-hosting/configuration.md)**.

## Contributing & testing

```bash
npm run db:migrate   # apply schema to a test Postgres
npm test             # vitest: unit + API + security, on real Postgres
npm run test:e2e     # playwright smoke suite (Chromium)
npm run build        # type-check and compile
```

CI runs the same suite on every PR against a real Postgres, including a
migration-reversibility check. See the **[command reference](./docs/reference/cli.md)**
and **[benchmarks](./BENCHMARK.md)**.

## License

MIT — use it, fork it, sell it, self-host it for your team. No open-core gotchas.
