---
title: Brainstorm — close remaining CRM/AI surface gaps
date: 2026-09-01
slug: crm-ai-parity
status: accepted
scope: B
---

# Brainstorm: CRM/AI đủ dùng (scope B)

## Summary

Session stream already closed GraphQL/MCP walk-the-graph for CRM pins, child lists, custom-object children, search, and dashboard stats. Remaining work to make Fourty a complete usable AI-native CRM (user chose **B**) is four deliveries: Agent tab on custom objects, report stats on GraphQL+MCP, custom-object search on the three search surfaces, and pipelines/stages on GraphQL+MCP. Admin REST stays REST. CSV import stays contacts-only. Unreproduced login overlay is verify-or-close, not a speculative patch.

## Outcome

A salesperson or an MCP/GraphQL client can treat **every CRM record type the product already ships** (contacts, companies, deals, **and no-code custom objects**) as a first-class AI record: find it, read neighbours, talk to the Agent tab about it, and read pipeline/report numbers without dropping to a REST-only corner.

## Constraints

- Reuse existing helpers (`pinnedWorkIds`, `searchCrm`, `reportStatsForRole`, `RecordTabs`, `objectByApiName`). No new queue, no new database, no pipeline DDL.
- `ai_conversations.entityType` is already unconstrained `text` — Agent-on-custom-objects needs **no migration**.
- Pipelines/stages are **not** in the action registry (`src/lib/actions/` has no pipelines module). GraphQL/MCP may hand-wire like `dashboardStats` / custom records, or extract actions first if write mutations land.
- MCP tool count is frozen at **36** in README, `docs/api/mcp.md`, `docs/getting-started/*`, `public/llms.txt`, and `tests/mcp-catalog.test.ts`. Any new tool (`get_report_stats`, `list_pipelines`, …) must bump the advertised number in every catalog surface.
- Field-level permissions apply to contacts/companies/deals only (ADR-011). Custom-object Agent/search uses object-level `objects` RBAC.
- Additive public contracts only unless the catalog count change is intentional and documented.
- Tests on `fourty-vitest-pg :5439` (`fourty_test`). Do not point vitest at host `:5432`.
- Reply/docs language: product docs stay English; session reports Vietnamese when talking to the user.

## Non-goals

- CSV import of companies/deals/custom objects (`docs/guides/import-export.md` already says contacts-only).
- Admin GraphQL/MCP: workflows, webhooks, members, audit, field-permissions, api-keys, SSO, saved-views, import/export.
- `get_note` / `get_activity` — REST has no GET-by-id; `list_notes` / `list_activities` already walk from `noteIds` / `activityIds`.
- Patching the login Next overlay without a failing reproduction (live `/login` 2026-09-01: badge `data-error=false`).
- Committing the large uncommitted working tree unless the user asks.
- Facts/suggestions on custom objects (`FACT_ENTITIES` is contact|company).

## Acceptance criteria

1. Custom-object detail (`/objects/{apiName}/{id}`) has the same **Timeline | Agent** switch as contacts. A thread binds `entityType=apiName` and `entityId`; `loadRecordContext` returns label + `data` facts + `taskIds`/`noteIds`/`activityIds`. Missing/forbidden record → same 404 as CRM. Tests: record-context + GraphQL/MCP get_record still additive.
2. `{ reportStats { sourceBreakdown { source leads } } }` and MCP `get_report_stats` return `reportStatsForRole` (field-permissions on amount/close/stage). Workspace isolation matches dashboard. Catalog count updated everywhere `36 tools` is asserted.
3. Prefix search (`searchCrm` / GraphQL `search` / MCP `search`) includes custom-object records. Palette `/api/search` (infix) includes them too so ⌘K is not a CRM-only finder. Hits expose `type` (apiName) + id + title. Cap still 25. `%`/`_` still empty.
4. GraphQL `pipelines` / `pipeline(id)` / `stages` (and matching MCP list/get, plus writes if they stay in B) return the same rows REST `/api/pipelines` and `/api/stages` already serve, RLS-scoped. Deal `stageId` updates keep working.
5. Login `/login` in `next dev`: no hydration error in console and Next badge `data-error=false` after compile. If it reproduces, fix the proven cause; if not, document closed-as-non-issue.
6. `npx tsc --noEmit` clean; focused vitest (graphql, mcp, mcp-catalog, mcp-neighbours, record-context, field-permissions) green; docs (`graphql.md`, `mcp.md`, `ai-assistant.md`, `custom-objects.md`, CHANGELOG) match shipped behavior.

## Options considered

### A — Session leftovers only

Agent tab on custom objects + GraphQL `reportStats` (+ MCP if catalog bump is accepted) + hydration verify-or-close.

- Assumes: “all” means the last leftover list, not product completeness.
- Fails first: custom objects still invisible to search; pipelines still REST-only for agents.

### B — CRM/AI đủ dùng (accepted)

A + custom-object search on REST/GraphQL/MCP + GraphQL/MCP pipelines & stages.

- Assumes: no-code objects and pipelines are core CRM, not admin.
- Fails first: MCP catalog churn (36 → N) if several tools land at once; pipeline writes without an action registry module drift from ADR-017.

### C — Clone every REST route onto GraphQL/MCP

B + workflows, webhooks, members, audit, field-perms, saved-views, import/export, api-keys.

- Assumes: “typed API for every object” includes administration.
- Fails first: contradicts ADR-008 (GraphQL for CRM objects, not every admin route) and explodes MCP catalog/docs.

## Recommendation

**B.** Smallest set that stops custom objects and pipelines from being second-class for AI clients, without building an admin GraphQL.

Pipeline **reads** first (list/get). Writes (create/rename/delete pipeline or stage) only if they can share one extracted helper with REST; otherwise leave writes on REST and document that — still satisfies “agents can see stages and move deals” because `update_deal(stageId)` already exists.

Search: extend `searchCrm` (and REST palette mapper) rather than a fourth search function.

Agent tab: reuse `RecordTabs`; widen `isRecordEntity` to “CRM enum **or** `objectByApiName` hits”; `permissionObjectFor` → `objects` for the latter.

## Delivery sequence

1. Agent tab on custom objects (UI + grounding + docs).
2. `reportStats` GraphQL + `get_report_stats` MCP (catalog bump).
3. Custom-object hits in `searchCrm` + palette.
4. Pipeline/stage GraphQL+MCP reads (writes only if helper extract is cheap).
5. Hydration verify-or-close; freeze schema; catalog tests; docs.

## Unresolved questions

- Pipeline **writes** on GraphQL/MCP in this delivery, or reads-only + REST writes? Recommendation: reads-only unless extract is cheap.
- MCP catalog: one bump at the end of B vs bump per new tool. Recommendation: one bump when the first new tool lands, then keep the count honest.
- Whether custom-object search titles use the first text field, `recordTitle()`, or `id` fallback — follow `src/app/(app)/objects/.../shared.ts` `recordTitle`.
