# trycompai/crm teardown vs Fourty — what to steal, what to refuse

_2026-08-08 · Source: `trycompai/crm` @ `release` (v1.4.0, shallow clone, read in full: README, `docs/agent.md`, `docs/api.md`, `docs/telemetry.md`, `apps/agent/**`, `packages/db/prisma/schema.prisma`). Fourty side read from `src/**`, `PARITY.md`, `plans/260708-1645-remaining-features-backlog.md`._

## 1. What Comp AI CRM actually is

Agentic-first CRM. Thesis stated in their README: *the agent is not a feature of the CRM; the CRM is where the agent keeps its notes*. Everything else follows from that.

| | |
|---|---|
| Shape | Turborepo/Bun monorepo, **three deployments**: `apps/app` (Next.js), `apps/api` (NestJS + tRPC), `apps/agent` ([eve](https://eve.dev), own deployment, own schedule) |
| Data | Prisma + Postgres (Neon), optional Redis (Upstash) |
| Auth | Better Auth, Google/Microsoft/own IdP. `ALLOWED_SIGN_IN` **is the entire authorisation model** |
| Tenancy | **Single tenant, deliberately.** No `organizationId` on any CRM record. One singleton `Organization` row for "what are we called" |
| Agent | 25+ authored tools, 4 markdown skills, 1 schedule, deny-all sandbox, per-session research budget |
| Managed-service coupling | Vercel Sandbox, Vercel Blob, Vercel AI Gateway, PostHog. The agent is effectively Vercel-shaped |

**Size/deps:** heavy. Bun + Turbo + Nest + Prisma + tRPC + eve + Biome. Fourty is 10 runtime deps and one process.

## 2. Head-to-head

### Where Fourty is ahead — do not regress any of these

| Dimension | Fourty | Comp AI |
|---|---|---|
| Tenancy | Postgres **RLS multi-tenant** | Single tenant by design |
| AuthZ | Object RBAC + **field-level permissions** + immutable audit log | One sign-in allow-list |
| Public API | REST + typed GraphQL + **MCP (20 tools)** + signed webhooks | tRPC only (internal). **No MCP server** |
| Deploy | 1 process + 1 Postgres, `docker compose up` | 3 deployments + Postgres (+Blob/Sandbox/Gateway for the agent) |
| Automation | Visual workflow builder on a durable queue | None — agents instead |
| Ops | Reversible-migration CI, benchmark harness, `/metrics`, DLQ | Not visible |
| Other | i18n, PWA, 2FA, SSO/OIDC, saved views, custom objects | — |

### Where Comp AI is ahead — the real gaps

| Gap | Comp AI | Fourty today |
|---|---|---|
| **Autonomous agent** | Own deployment, own work queue, resumes after redeploy, spends a budget, books its own follow-ups | Request-response chat only (`src/lib/ai/agent.ts`), dies with the HTTP request |
| **Evidence model** | `lib/evidence.ts` + `contactFact` — no tool may pass a confidence; the ledger prices observations into bands | None. AI writes are all-or-nothing, gated only by a human clicking confirm |
| **Enrichment** | Identity matching, job-change detection, briefs, company brand data, portraits | None |
| **Mail → facts** | Signature blocks / thread replies / meeting attendance are the *primary* evidence, free, no vendor | Fourty ingests mail + calendar and mines **nothing** from it |
| **Per-record agent UI** | Agent tab on every contact/company/deal, durable multi-conversation threads | Single global chat (backlog #3 names this gap) |
| **Custom agents** | Describe in one sentence → typed permission manifest → human deploys a pinned immutable version | None |
| **Capability awareness** | One registry: printed at boot, stated in the prompt, tools return "not configured, retrying won't help" | Prompt (`src/lib/ai/prompt.ts`) says nothing about what this install can reach |
| **Model as config** | `AppSetting` row + Settings UI (a self-hoster's admin cannot redeploy) | Env var only |

## 3. The eight ideas worth stealing (stack-independent)

1. **Evidence, not confidence.** `WEIGHTS` maps observation kinds (`crm.signature-block`, `profile.email-match`, `github.account-identity`, `contradiction`) to a weight + a `primary` flag; combination is `1 − Π(1−w)`, capped at .99, and a contradiction *holds the fact* at .45 rather than nudging it. Bands: VERIFIED ≥ .85 **and** primary → written; PROBABLE ≥ .55 → proposed; POSSIBLE ≥ .3 → kept, unshown; below → not stored.
2. **One write path with three invariants a prompt cannot enforce** (`lib/facts.ts`): never overwrite a human-entered value, never re-offer a dismissed value, never write without a primary source. Old value → `SUPERSEDED`, which is also how job-change detection falls out for free.
3. **The work queue is a domain table, not a job queue.** `agentTask(contactId, kind, reason, priority, budget, attempts, dueAt, leasedUntil, outcome)`; `claimDue` leases with `FOR UPDATE SKIP LOCKED`. *"Every N minutes, the oldest ten contacts" belongs in a `dueAt`, not a cron expression.* The `reason` is shown to the rep — an agent that cannot say why it will be back in 14 days has a default, not a reason.
4. **Two lanes.** Work with nothing to decide (logo, portrait) runs directly, 60/tick; work that needs a model gets one session, 12/tick. They measured the failure: visible work queued behind sixty LLM runs for 25 minutes.
5. **Capability registry.** Single module knows what is configured, prints it at boot, injects it into the prompt, and hands tools a shared *not configured, retrying will not help* result — checked **before** the budget is charged. Never throws.
6. **Reads never dead-end.** Every read returns the ids of neighbouring records. Breaking it made the agent ask a rep — who had the company open with contacts on screen — to paste an email address. And `search_crm` does **no fuzzy matching**: "Marchetti" reaching "Marchetta" is a wrong record about a real person.
7. **Egress is the boundary, not reading.** It may read every email body; the rules are (a) no customer text in a third-party query — derived questions only, (b) nothing from a mailbox into the sandbox, (c) nothing sensitive logged. The sandbox is `deny-all` egress and is **never given `DATABASE_URL`** — "a shell with credentials and network is exfiltration-shaped; with neither it is a text processor."
8. **Custom agents = typed permissions + a human deploy boundary.** Record scope is explicitly `SELECTED` or `WORKSPACE` (*empty never means all*); actions name their type (`crm.activity.create` naming `NOTE`, `TASK`, or both); every action is ledgered **before** execution and keyed by the model's call id for replay safety; saving produces a private READY version and **never deploys it**; manifests **fail closed** when a grant is missing.

## 4. What to refuse

| | Why |
|---|---|
| Bun / Turborepo / NestJS / tRPC / Prisma | Pure churn. Fourty's single-process Next + Drizzle is the product claim |
| Splitting into 3 deployments | Kills the 30-second deploy |
| eve / Vercel Sandbox / Blob / AI Gateway | Vendor-coupled; fourty is self-host-first. A sandbox is only needed if the agent gets a shell — it does not need one |
| Single-tenant simplification | Fourty's RLS is a moat, not overhead |
| Dropping the model to a hosted gateway | BYO-key stays |
| PostHog telemetry | Their doc is exemplary (in-code property allowlist, `$ip: null`, one UUID, nothing client-side), but an install ping is a **project decision**, not a technical one. Flagged, not recommended |

## 5. Recommended sequence for Fourty

Ordered by (leverage ÷ new infrastructure). Detail in [`plans/260808-2159-agentic-crm-upgrade/plan.md`](../260808-2159-agentic-crm-upgrade/plan.md).

| # | Phase | Size | Unlocks |
|---|---|---|---|
| 0 | Capability registry + prompt grounding + non-dead-end reads | S | Every later phase; fixes real chat-quality bugs today |
| 1 | Evidence ledger + suggestion inbox | M | The safety model that makes background writes possible at all |
| 2 | Agent work ledger (`agent_tasks`) + two-lane dispatcher on pg-boss | M | Also closes backlog #14 (mail auto-pull) |
| 3 | Keyless research pass — mail/calendar → evidence | L | The differentiator: works with **zero** API keys, because Fourty already has the mailbox |
| 4 | Per-record agent panel + durable conversations | M | Closes backlog #3/#4 |
| 5 | Custom agents with typed permission manifests | L | Built on the existing action registry (ADR-017) + RBAC + audit |

**The asymmetry worth naming:** Comp AI's best evidence sources (`crm.signature-block`, `crm.thread-reply`, `crm.meeting-attendance`) need no vendor and no key — and Fourty already ingests mail and calendar into `email_messages` / `calendar_events`. Phase 3 is therefore mostly *parsing what Fourty already stores*, not buying data. And unlike Comp AI, Fourty can hand the whole evidence surface to external agents over MCP, which they cannot.

## Questions — resolved 2026-08-08 (decisions locked in [plan.md](../260808-2159-agentic-crm-upgrade/plan.md))

1. Polymorphic schema from day one; contact-first surface. Employer → `company_id` resolution by exact domain, never a parallel string.
2. Auto-apply is a carve-out for **deterministic** research only (empty field + VERIFIED + primary, `via:"research"`, one-click Revert); generative writes stay propose-only. ADR-018 written in Phase 1.
3. Telemetry: **out** for OSS Fourty.
4. Keyless pass: **on by default** once a mailbox is connected, per-workspace kill switch; AI chat stays off-by-default.

**Correction found in verification:** the teardown's "Fourty already ingests mail … Phase 3 is mostly parsing what Fourty already stores" was half-true — `email_messages` stores only a 280-char head snippet (`parse-email.ts:74`); signature blocks are discarded at ingest. Calendar attendees *are* stored. Phase 3 now carries an extract-at-ingest hard prerequisite.
