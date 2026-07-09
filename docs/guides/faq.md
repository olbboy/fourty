# FAQ

*Short answers to the questions people ask most. Expand a question to read it.*

## Deployment & requirements

<details>
<summary>Do I need Redis or a message broker?</summary>

No. Fourty's durable job queue lives in Postgres itself
([pg-boss](../adr/004-queue-and-workers.md)) — one database is the whole stateful
footprint. That's the core of the [zero-ops philosophy](../getting-started/why-fourty.md).
</details>

<details>
<summary>What are the minimum requirements?</summary>

Docker + Compose, **or** Node.js 20+ and Postgres 16. Nothing else. See
[Installation](../self-hosting/installation.md).
</details>

<details>
<summary>Can I run it without Docker?</summary>

Yes — run from source against your own Postgres. See
[Installation → From source](../self-hosting/installation.md#option-b--from-source).
</details>

## Data & migration

<details>
<summary>How do I import my existing contacts?</summary>

[CSV import](./import-export.md) with fuzzy header matching, or the API. To move a whole
workspace from Twenty, use the [`@fourty/twenty-migrate` CLI](../self-hosting/upgrading.md#from-twenty).
</details>

<details>
<summary>I used the old SQLite version of Fourty. Can I migrate?</summary>

Yes, losslessly and round-trip tested:
[Upgrading → From SQLite](../self-hosting/upgrading.md#from-sqlite).
</details>

<details>
<summary>Are schema migrations reversible?</summary>

Every migration ships a hand-written `down` and is verified by a CI test that applies the
full chain up → down → re-apply and asserts an identical schema. See
[Upgrading](../self-hosting/upgrading.md#how-migrations-work).
</details>

## Security & tenancy

<details>
<summary>How is one workspace's data isolated from another's?</summary>

Postgres **Row-Level Security**. The app connects as a non-owner role, so tenancy is
enforced by the database — not by application `WHERE` clauses that a bug could skip. See
[ADR-001](../adr/001-tenancy-model.md).
</details>

<details>
<summary>Are API keys stored in plaintext?</summary>

No — keys are **SHA-256-hashed at rest** and shown once at creation. Revoke any key from
Settings. See [API overview](../api/overview.md#authentication).
</details>

<details>
<summary>Can a workflow webhook hit an internal address?</summary>

Not by default — Fourty blocks private/loopback/link-local targets to prevent SSRF. Opt
in with `FOURTY_ALLOW_PRIVATE_WEBHOOKS=1` only on a trusted network. See
[Webhooks](../api/webhooks.md#ssrf-protection).
</details>

## AI

<details>
<summary>Does Fourty send my CRM data to an AI provider?</summary>

Only if you turn AI on. Both AI features are **off by default**; with them off, no CRM
data leaves the box. You bring your own key, and can point at a **local** model (Ollama).
See [AI assistant](./ai-assistant.md).
</details>

<details>
<summary>Will the AI change my records on its own?</summary>

No. The chat **proposes** writes you confirm; the workflow AI-draft action only ever
writes a **draft note** for review. Human-in-the-loop is a hard guardrail
([ADR-016](../adr/016-ai-native-strategy.md)).
</details>

## Features & parity

<details>
<summary>Does Fourty have a GraphQL API?</summary>

Yes — a typed `POST /api/graphql` with introspection, alongside the REST API. See
[GraphQL](../api/graphql.md).
</details>

<details>
<summary>What does Fourty <em>not</em> have vs Twenty?</summary>

Honestly: SAML, a define-as-code apps/SDK platform, and calendar-over-OAuth (mail OAuth
is done; calendar is via ICS). See the cited matrix in [PARITY.md](../../PARITY.md).
</details>

## Related

- **[Troubleshooting →](../self-hosting/troubleshooting.md)** — when something isn't working.
- **[Glossary →](../getting-started/glossary.md)**
