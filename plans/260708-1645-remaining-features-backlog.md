# Fourty — Remaining Features Backlog

_Last updated: 2026-07-08 · Source: [`PARITY.md`](../PARITY.md) matrix (cited) + in-session defer decisions._
_Status of shipped work: see [`PROGRESS.md`](../PROGRESS.md). Legend: ❌ not built · 🟡 partial · ⏸ deferred._

Gaps vs Twenty 2.0, most-actionable framing. Impact/effort are rough.

## ❌ Not built at all

| # | Feature | Notes | Effort |
|---|---|---|---|
| 1 | Define-as-code apps/SDK platform (model data + server logic + React layouts, git-backed) | Twenty 2.0 headline; a separate platform direction | XL |
| 2 | Plugin/app install–uninstall framework | Rides on the apps platform (#1) | L |
| 5 | SAML SSO | XML-DSig, heavy, hard zero-dep; OIDC already covers modern IdPs | L |
| 6 | Helm chart | Twenty's is community-only too | S |

## 🟡 Partial — needs completion

| # | Feature | Missing | Effort |
|---|---|---|---|
| 3 | AI agents / chat in-app | ✅ Round-1 shipped (ADR-015): in-app chat reads via tools + human-confirmed writes, BYO provider. Missing: per-record assistant, async/worker agent, `update_*`/`delete_*` + workflow-trigger tools, multi-conversation history UI | L |
| 4 | Streaming ops → live UI | ✅ Round-1 shipped: chat replies + tool results stream over SSE. Missing: streaming for background/async agent ops (depends on #3 async agent) | S |
| 7 | Typed TS SDK on npm | Only typed clients inside `@fourty/twenty-migrate`; no general dev SDK | M |
| 8 | Calendar-over-OAuth | Mail OAuth done; provider calendar APIs return JSON → need JSON→event adapter (ICS feed covers it today) | M |
| 9 | IMAP transport | `imap` provider enum exists, no fetch; only Gmail/Graph OAuth built | M |
| 10 | GraphQL mutations for deals/tasks/notes | Currently read-only via GraphQL, writes go through REST (side effects live there) | M |
| 11 | Admin UI for SSO + mailbox connect | Backend/routes exist (SSO CRUD, `…/connect`), but no Settings page to drive them — API-only | M |
| 12 | Zero-downtime migration | Expand→contract + k6 drill only authored, not a full guarantee | M |
| 13 | Virtualized list for large datasets | Not verified, likely absent (PARITY 📏) | S |

## ⏸ Deferred this session (decided: later)

| # | Feature | Context |
|---|---|---|
| 14 | Periodic mail auto-pull worker (pg-boss cron) | `…/run` is manual/trigger-driven today |
| 15 | Encrypt secrets at rest (SSO client_secret, OAuth tokens, IMAP password) | Q2 defer; stored plaintext + redacted on read |
| 16 | Per-workspace SSO + email-domain routing | Currently instance-global (fits self-host single-org) |

## 🔧 Infra / smaller polish

| # | Feature | Context |
|---|---|---|
| 17 | Historical mail backfill + provider push/watch (Gmail watch, Graph webhooks) | ADR-009 "later tier" |
| 18 | SSO RP-initiated logout + WebAuthn/passkeys | ADR-012/014 left open |
| 19 | Benchmark at 100k / 1M | Harness ready (`SIZE=100000 bench/run.sh …`), not yet run |
| 20 | Per-field SQL index for custom-object data | C1 perf caveat (metadata-driven JSON records) |

## Suggested priority (if continuing)

- **High value / low effort:** #11 admin UI (turns already-built D4/C6 into usable), #10 full GraphQL writes, #14 mail auto-sync.
- **Security:** #15 encrypt secrets at rest.
- **Strategic / large:** #1 apps/SDK platform (own direction), #3 AI agents.

## Open questions

- Is a single Fourty instance ever multi-org (drives #16 per-workspace SSO)?
- Do backups/dumps land where the app key doesn't (drives #15 urgency)?
- Which is the next target — #11, #10, #14, or start #1?
