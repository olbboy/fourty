# Why Fourty

*A small, legible CRM you can actually run yourself — and hand to an AI agent safely.*

Most open-source CRMs ask you to operate a distributed system before you can add
your first contact: an app server, a separate worker, Redis, a message broker, a
search cluster. Fourty makes the opposite bet. It is a **single Next.js process and
one Postgres database** — no Redis, no broker, ~10 runtime dependencies — that still
ships forecasting, lead scoring, workflow automation, a typed API, and a native MCP
server for AI agents.

## The philosophy

Three principles shape every decision (and every [ADR](../adr/)):

1. **Zero-ops by default.** `docker compose up` brings up Postgres, runs the
   migrations once, and starts the app plus a background worker. The durable job
   queue lives in Postgres itself ([pg-boss](../adr/004-queue-and-workers.md)) — there
   is nothing else to deploy or babysit.
2. **Deterministic over magical.** Lead scoring, deal health, and forecasting are
   pure, tested functions you can read and tune in one file — not opaque model
   output. When a rule will do, Fourty uses a rule.
3. **Legible and MIT.** The whole UI is ~40 small components on Tailwind — no
   component library to fork a theme from. The licence is MIT: use it, fork it,
   sell it, embed it. No open-core gotchas.

## How it compares

|  | **Fourty** | Twenty | Salesforce |
|---|---|---|---|
| Deploy | Docker Compose (Postgres + worker) | Postgres + Redis + workers | Cloud only |
| Runtime dependencies | ~10 | Many (Redis, broker, search) | N/A |
| Built-in analytics | Forecast, funnel, velocity, win/loss, aging, sources | Basic | Extensive ($$) |
| Lead scoring | ✅ Automatic, zero-config | ❌ ("coming soon") | Einstein ($$) |
| Workflow automation | ✅ Visual builder, durable queue | ✅ | Flow ($$) |
| REST **and** GraphQL | ✅ Both | GraphQL-first | ✅ |
| MCP server (AI agents) | ✅ Self-host, 20 tools, stdio + HTTP | ✅ (Cloud/OAuth) | ❌ |
| Licence | **MIT** | AGPL-3.0 | Proprietary |

> **A small-team lens.** This table compares the out-of-the-box experience for one
> team — not full enterprise-platform parity. Twenty 2.0 still leads on **SAML**, an
> **apps/SDK platform**, and **calendar-over-OAuth** (Fourty ships mail OAuth;
> calendar is via ICS feeds). For the honest, cited matrix — strengths and gaps
> both — see **[PARITY.md](../../PARITY.md)**.

## Where Fourty deliberately stops

Fourty is not trying to out-platform Twenty. It will not ship an autonomous in-app
agent framework or a define-as-code apps/SDK — those contradict the zero-ops,
deterministic, MIT moat. Instead it aims to be **the safest, fully-OSS substrate for
*your* AI**: a broad MCP surface, deterministic intelligence, and an optional,
off-by-default generative layer. That reasoning is recorded in
**[ADR-016 — AI-native strategy](../adr/016-ai-native-strategy.md)**.

## Next

- **[Quickstart →](./quickstart.md)** — stand up an instance in 30 seconds.
- **[Key features →](./key-features.md)** — the full tour.
