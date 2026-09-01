<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./public/brand/logo-full-inverse.svg">
  <img src="./public/brand/logo-full.svg" alt="Fourty" width="260">
</picture>

### The open-source CRM that deploys in 30 seconds.

Twice the CRM, half the complexity. One process, one Postgres, zero infrastructure.

[![CI](https://github.com/olbboy/fourty/actions/workflows/ci.yml/badge.svg)](https://github.com/olbboy/fourty/actions/workflows/ci.yml)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](./LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/olbboy/fourty)](https://github.com/olbboy/fourty/releases)
[![GitHub stars](https://img.shields.io/github/stars/olbboy/fourty?style=social)](https://github.com/olbboy/fourty/stargazers)

[Documentation](./docs/) · [Quick Start](#quick-start) · [Why Fourty](#why-fourty) · [Self-Hosting](./docs/self-hosting/) · [API](./docs/api/)

</div>

---

## Why Fourty?

Most open-source CRMs make you operate a distributed system before you can add a contact. Fourty is a **single Next.js process and one Postgres** — no Redis, no broker, no queues to babysit — that still ships everything a sales team needs out of the box.

And it keeps the records true on its own. Connect a mailbox and Fourty fills in job titles and company links from the signatures and replies already in it — **no API key, no data vendor, no AI model**. Every automatic write shows the evidence it came from, never overwrites a value a person typed, and reverts in one click.

```bash
git clone https://github.com/olbboy/fourty && cd fourty
cp .env.example .env && docker compose up --build
# → http://localhost:3000 — create your admin account, done.
```

Read the full rationale in **[Why Fourty](./docs/getting-started/why-fourty.md)**.

## ✨ Features

<table>
<tr>
<td width="50%">

**🏢 Core CRM**
Contacts, Companies, Deals, Tasks, Notes — polymorphic activity timeline, list views with search/filter/sort, and detail pages (notes live on the record they are pinned to).

</td>
<td width="50%">

**📊 Kanban Pipeline**
Drag deals between stages with optimistic updates. Per-column totals, probability-weighted forecasts, and multi-currency support (12 currencies, auto-USD).

</td>
</tr>
<tr>
<td>

**🎯 Lead Scoring**
Every contact gets a live 0–100 score from profile fit, engagement recency, and commercial signals. Pure, tested functions you can tune.

</td>
<td>

**📈 Analytics & Reports**
Forecast, win rate, sales cycle, funnel, win/loss by month, source conversion, pipeline aging, and stale-deal alerts — all built-in.

</td>
</tr>
<tr>
<td>

**⚡ Workflow Automation**
Visual builder on a durable Postgres queue. Six action types, template variables, conditions, retry with backoff, and full run history.

</td>
<td>

**🔍 Keyless Research**
A background pass mines your own mailbox for job titles and company links. No API key, no vendor, no model. Every write shows its source.

</td>
</tr>
<tr>
<td>

**🔌 APIs Everywhere**
REST, typed GraphQL, a native MCP server (39 tools, stdio + HTTP), and signed webhooks — every object accessible from every surface.

</td>
<td>

**🤖 AI Assistant**
BYO-key chat per record or global. Reads your CRM and proposes writes you confirm. Off by default; useful without it.

</td>
</tr>
<tr>
<td>

**🧩 Custom Objects**
Extend the data model with no-code custom fields and objects, instantly available in forms, detail pages, REST, GraphQL, and MCP.

</td>
<td>

**🔒 Enterprise Security**
Multi-tenant with Postgres RLS, RBAC + field-level permissions, immutable audit log, 2FA/TOTP, SSO (OIDC), signed webhooks, SSRF protection.

</td>
</tr>
</table>

Full tour: **[Key Features](./docs/getting-started/key-features.md)** · **[User Guide](./docs/guides/)**

## ⚖️ How It Compares

|  | **Fourty** | Twenty | Salesforce |
|---|---|---|---|
| Deploy | `docker compose up` (Postgres only) | Postgres + Redis + workers | Cloud only |
| Built-in analytics | Forecast, funnel, velocity, win/loss, aging | Basic | Extensive ($$) |
| Lead scoring | ✅ Automatic, zero-config | ❌ | Einstein ($$) |
| Workflow automation | ✅ Visual builder, durable queue | Limited | Flow ($$) |
| REST **and** GraphQL | ✅ Both | GraphQL-first | ✅ |
| MCP server (AI agents) | ✅ Self-host, 39 tools | ✅ (Cloud/OAuth) | ❌ |
| Self-host complexity | Minimal (1 process + PG) | High (5+ services) | N/A |
| License | **BSL 1.1** (free for internal use) | AGPL | Proprietary |

> **Honest note.** Twenty 2.0 still leads on SAML, a define-as-code apps/SDK platform, and calendar-over-OAuth. Fourty's edge is time-to-first-value and operational simplicity. See the [benchmark results](./docs/benchmarks.md) for measured performance data.

## 🚀 Quick Start

### Docker Compose (recommended)

Bundles Postgres, runs migrations, starts app + background worker:

```bash
cp .env.example .env
docker compose up --build      # → http://localhost:3000
```

### From Source

Requires Node.js ≥ 20.9 and PostgreSQL 16:

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

## 📚 Documentation

| | |
|---|---|
| 🚀 **[Get Started](./docs/getting-started/)** | Why Fourty, a 30-second deploy, and a full feature tour. |
| 📖 **[User Guide](./docs/guides/)** | Records, pipeline, scoring, analytics, workflows, custom objects, AI. |
| 🐳 **[Self-Hosting](./docs/self-hosting/)** | Install, configure, upgrade, and operate your instance. |
| 🔌 **[API & Developers](./docs/api/)** | REST, GraphQL, the MCP server, webhooks. |
| 🏛 **[Architecture](./docs/architecture.md)** | How Fourty is built, plus [19 decision records](./docs/adr/). |
| 📊 **[Benchmarks](./docs/benchmarks.md)** | Measured head-to-head performance vs Twenty @10k rows. |

## 🤝 Contributing

We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code contributions.

```bash
npm run db:migrate   # apply schema to a test Postgres
npm test             # vitest: unit + API + security, on real Postgres
npm run test:e2e     # playwright smoke suite (Chromium)
npm run build        # type-check and compile
```

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full guide, and our **[Code of Conduct](./CODE_OF_CONDUCT.md)**.

## 🔐 Security

Please report security issues **privately** via [GitHub Security Advisories](https://github.com/olbboy/fourty/security/advisories/new). See our **[Security Policy](./SECURITY.md)** for full details.

## 📈 Star History

<a href="https://star-history.com/#olbboy/fourty&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=olbboy/fourty&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=olbboy/fourty&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=olbboy/fourty&type=Date" width="600" />
 </picture>
</a>

## 📄 License

Fourty is licensed under the **[Business Source License 1.1](./LICENSE)** (BSL 1.1).

- ✅ **Internal use** — Free. Self-host for your own team, modify, contribute back.
- ✅ **Non-production use** — Free. Evaluate, develop, test without restriction.
- 💼 **Commercial use** — Requires a commercial license. Contact us for pricing.
- 🔓 **Auto-converts** to Apache 2.0 on **2030-08-09**.

The **name and logo** are trademarks. Fork freely; ship your build under your own name and mark.
→ [Trademark Guidelines](./docs/design-guidelines.md#trademark)

---

<div align="center">

**[⬆ Back to top](#)**

Made with ❤️ by the Fourty community

</div>
