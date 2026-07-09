# Fourty documentation

**The open-source CRM that deploys in 30 seconds.** One process, one Postgres, zero
infrastructure — with built-in analytics, lead scoring, workflow automation, a REST
**and** GraphQL API, and a native MCP server for AI agents.

Pick a path below, or jump straight to the [Quickstart](./getting-started/quickstart.md).

---

## Start here

| | |
|---|---|
| 🚀 **[Get started](./getting-started/)** | Why Fourty, a 30-second deploy, and a tour of what it does. |
| 📖 **[User guide](./guides/)** | Use the product: records, pipeline, scoring, analytics, workflows, custom objects, AI. |
| 🐳 **[Self-hosting](./self-hosting/)** | Install, configure, upgrade, and operate your own instance. |
| 🔌 **[API & developers](./api/)** | REST, GraphQL, the MCP server, webhooks — everything the UI does, over the wire. |
| 🏛 **[Architecture](./architecture.md)** | How Fourty is built, and the decision records behind it. |

---

## Getting started

New to Fourty? Read these in order.

- **[Why Fourty](./getting-started/why-fourty.md)** — the philosophy, the moat, and an honest comparison to Twenty and Salesforce.
- **[Quickstart](./getting-started/quickstart.md)** — deploy with Docker Compose or from source, and create your first admin account.
- **[Key features](./getting-started/key-features.md)** — a guided tour of everything in the box.

## User guide

One page per feature area. Each opens with what it is and why it matters, then how to use it.

- **[Records & the activity timeline](./guides/records.md)** — contacts, companies, deals, tasks, notes.
- **[Pipeline & deals](./guides/pipeline.md)** — Kanban stages, weighted forecast, multi-currency.
- **[Lead scoring](./guides/lead-scoring.md)** — the automatic 0–100 model, and how to tune it.
- **[Analytics & reports](./guides/analytics.md)** — the dashboard and the full report catalogue.
- **[Workflows & automation](./guides/workflows.md)** — triggers, conditions, actions, run history.
- **[Custom fields & objects](./guides/custom-objects.md)** — extend the data model with no code.
- **[Import & export](./guides/import-export.md)** — CSV in and out, with fuzzy header mapping.
- **[Email & calendar](./guides/email-calendar.md)** — connect a Gmail/Microsoft mailbox or ICS feed.
- **[AI assistant](./guides/ai-assistant.md)** — the optional, BYO-key in-app chat.

## Self-hosting

- **[Installation](./self-hosting/installation.md)** — Docker Compose (recommended) or from source.
- **[Configuration](./self-hosting/configuration.md)** — the complete environment-variable reference.
- **[Upgrading & migrations](./self-hosting/upgrading.md)** — reversible schema migrations, and importing from SQLite or Twenty.
- **[Operations](./self-hosting/operations.md)** — backups, observability, rate limits, and the security posture.

## API & developers

- **[API overview](./api/overview.md)** — authentication, API keys, error shapes, rate limiting.
- **[REST API](./api/rest.md)** — every resource, over JSON.
- **[GraphQL API](./api/graphql.md)** — the typed `POST /api/graphql` endpoint.
- **[MCP server](./api/mcp.md)** — expose Fourty to Claude, Cursor, and other LLM clients.
- **[Webhooks](./api/webhooks.md)** — outbound events, with HMAC signatures.

## Architecture

- **[Architecture overview](./architecture.md)** — the system, end to end.
- **[Decision records](./adr/)** — 16 ADRs covering tenancy/RLS, the queue, GraphQL, MCP, and more.

---

## Reference material

These evidence-backed documents sit alongside the guides above:

- **[Feature parity vs Twenty](../PARITY.md)** — the honest, cited capability matrix.
- **[Claims ledger](../CLAIMS.md)** — every headline claim cross-checked against code and tests.
- **[Benchmarks](../BENCHMARK.md)** — reproducible head-to-head performance numbers.
- **[Security](../SECURITY.md)** — the security model and disclosure policy.
- **[Command reference](./reference/cli.md)** — the `npm run` catalogue.
- **[Changelog](../CHANGELOG.md)** · **[Project status](../PROGRESS.md)**

> **Conventions.** Callouts marked **Note** are helpful context; **Warning** flags
> something that can bite you in production. Commands assume a POSIX shell. Every
> feature described here ships with a passing test — nothing is documented as done
> until it is.
