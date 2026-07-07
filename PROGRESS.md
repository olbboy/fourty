# PROGRESS.md — Road to production

_Audited commit `9de80c7`, branch `claude/fourty-production-readiness-8q6wyl`,
2026-07-07._

## TL;DR (honest state)

Fourty is a **single-process, single-tenant SQLite CRM** with solid core
features and now a real API/security test suite. It is **not** a drop-in Twenty
replacement: the four acceptance gates (A/B/C/D) are **not green**, and closing
them — multi-tenancy, RBAC, MCP server, `twenty-migrate`, a repro benchmark — is
weeks-to-months of engineering, not one session. This document states exactly
what is done (with evidence), what isn't, and the realistic order to close it.

**Anti-vanity rule applied:** nothing below is marked done unless a test passes
or a command was actually run. No benchmark numbers are published because none
were measured.

## What was delivered this session (evidence-backed)

1. **Ground truth (Tier 1 #1)** — `CLAIMS.md` (every README claim audited vs
   code + tests) and `PARITY.md` (Fourty vs Twenty 2.0, cited). This is the
   mandatory RULE #0 deliverable and it is complete.
2. **Two real security fixes, with tests** (mission: security bugs before
   features):
   - **Login brute-force rate limiting** → `src/lib/ratelimit.ts`, wired into
     `/api/auth/login` (429 + `Retry-After`).
   - **Webhook SSRF guard** → `src/lib/net.ts`, wired into the workflow engine's
     `webhook` action; blocks private/loopback/link-local/metadata targets by
     default, opt-out via `FOURTY_ALLOW_PRIVATE_WEBHOOKS=1`.
3. **First API test coverage** — `tests/api-integration.test.ts` (CRUD +
   validation + workflow dispatch through the real handlers) and
   `tests/api-auth.test.ts` (invalid/revoked key → 401, plus a static guard that
   every non-auth route calls `authenticate()`).
4. **Verified the existing baseline actually runs**: `npx vitest run` → **55
   passing** (was 33); `npm run build` → **green**.

## Gate status

### Gate A — Production-ready & performance vs Twenty
| Item | Status |
|---|---|
| One-command deploy (Docker) | 🟡 `Dockerfile` works; **no Compose/Helm, no healthcheck/graceful-shutdown/zero-downtime migration** |
| CI: typecheck+lint+unit+integration+E2E | 🟡 CI runs `test`+`build`; **no lint step wired, no E2E, no coverage report** |
| Reversible migrations | ❌ idempotent DDL only; **latent upgrade bug** (new columns never `ALTER`ed into existing DBs) |
| Backup/restore drill | ❌ not automated |
| Observability (logs/metrics/tracing) | ❌ none |
| Benchmark repro vs Twenty | ❌ not built; **no fabricated numbers** |
**Gate A: NOT MET.**

### Gate B — Security & multi-tenancy
| Item | Status |
|---|---|
| Multi-tenant isolation tests | ❌ **no multi-tenancy exists to isolate** |
| RBAC to field level + matrix | ❌ role column unenforced |
| OAuth2+PKCE / SSO / 2FA | ❌ password + cookie only |
| Immutable audit log | 🟡 mutable timeline |
| Rate limiting | 🟡 login only (added) |
| Input validation | ✅ zod on all writes |
| Security scan in CI (audit/SAST/secrets) | ❌ not wired |
| SSRF / webhook hardening | ✅ added this session |
**Gate B: NOT MET** (two hardening items landed; the structural items remain).

### Gate C — Extensibility & migration
| Item | Status |
|---|---|
| `@fourty/twenty-migrate` | ❌ |
| CSV / Salesforce / HubSpot import | 🟡 CSV yes; SF/HubSpot no |
| Custom objects (not just fields) | ❌ |
| REST+GraphQL auto-gen for custom objects | ❌ REST only, fixed objects |
| Typed TS SDK on npm | ❌ |
| Plugin/app system | ❌ |
**Gate C: NOT MET.**

### Gate D — AI-native
| Item | Status |
|---|---|
| Native MCP server | ❌ |
| JSON ops schema + validate/coerce/reject | ❌ |
| Streaming ops → live UI | ❌ |
| E2E AI assistant w/ undo + approval gate | ❌ |
| `llms.txt` + AI integration guide | ❌ |
**Gate D: NOT MET.**

## Recommended order to actually close the gates

The mission says fix security/tenancy before features and don't jump tiers.
Ordered by "unblocks-adoption" value and by dependency:

1. **Multi-tenancy foundation** (Gate B, structural). Add a `workspaces` table
   and a `workspaceId` on every CRM row + `apiKeys` + `sessions`; scope every
   query by workspace in one choke-point (a `scoped(db, workspaceId)` helper).
   Then write the **cross-tenant isolation test suite** (REST/GraphQL/webhook/
   attachment/MCP) the mission demands. *This is the single highest-value change
   and everything enterprise depends on it. Est: large.*
2. **Migrations** (Gate A). Introduce `drizzle-kit` (or a hand-rolled versioned
   migrator) with up/down; fixes the latent upgrade bug. Prereq for evolving the
   schema for (1) without breaking existing installs.
3. **RBAC enforcement + matrix tests** (Gate B). Enforce `admin` for
   key/workflow/custom-field/settings mutations; add per-object read/write
   checks; test matrix. (Low risk once (1) exists.)
4. **CI hardening** (Gate A/B): add lint, `npm audit`/SAST/secret-scan, and a
   coverage report to `.github/workflows/ci.yml`.
5. **Benchmark repro harness** (Gate A): shared seed script (10k/100k/1M),
   k6/autocannon for API, Playwright/Lighthouse for UI, one-command runner →
   markdown table. Stand up Twenty via Compose for head-to-head. Publish real
   numbers **including losses**.
6. **`@fourty/twenty-migrate` MVP** (Gate C): read Twenty via its REST/GraphQL,
   map standard objects + custom fields + users → Fourty, dry-run + loss report.
7. Tier-2 parity per `PARITY.md` (custom objects, GraphQL, saved views UI,
   email/calendar sync, webhooks retry+signature, i18n, a11y).
8. Gate D (MCP server, JSON ops, AI assistant E2E).

## Key risks & trade-offs (stated plainly)

- **SQLite ceiling.** Fourty's core selling point (one process, one file) is
  also its scaling ceiling: single-writer concurrency and no horizontal scale.
  A serious multi-tenant SaaS deployment likely needs the Postgres path the
  README hand-waves at — which is a real migration, not a driver swap. Decide
  early: *stay single-team-simple* (lean into the niche) **or** *go
  multi-tenant Postgres* (compete with Twenty head-on). Trying to be both
  half-heartedly is the worst outcome.
- **License.** Fourty is MIT vs Twenty's AGPL. MIT is more permissive
  (embeddable, resellable) — a genuine differentiator — but forfeits AGPL's
  copyleft protection against closed-source SaaS forks. This is a product
  decision to make consciously, not by default.
- **"Replace Twenty" vs reality.** On current architecture Fourty will not beat
  Twenty on the platform/enterprise axes (multi-tenancy, apps SDK, GraphQL, MCP)
  without substantial new subsystems. It can win on *time-to-value, ops
  simplicity, built-in analytics, and lead scoring* for small teams. The honest
  near-term goal is to be **the best zero-ops single-team CRM**, and to close
  Tier-1 security/tenancy gaps so it's *safe* in production for that audience —
  not to claim Twenty parity it doesn't have.

## Evidence index
- Tests: `npx vitest run` → 55 passing (`tests/*.test.ts`).
- Build: `npm run build` → green.
- Audit: `CLAIMS.md`. Competitive matrix: `PARITY.md`.
- Security fixes: `src/lib/ratelimit.ts`, `src/lib/net.ts` + `tests/security.test.ts`.
