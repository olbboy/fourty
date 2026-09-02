---
title: "CRM/AI parity (scope B)"
description: "Agent tab on custom objects, reportStats + pipeline reads on GraphQL/MCP, custom-object search on REST/GraphQL/MCP/⌘K."
status: completed
priority: P1
effort: 13h
branch: main
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-09-01
---

# CRM/AI parity (scope B)

## Overview

Close the remaining CRM/AI surface gaps so every shipped record type (contacts, companies, deals, **and no-code custom objects**) is first-class for in-app Agent, GraphQL, MCP, and ⌘K. Admin REST stays REST. CSV import stays contacts-only. Login overlay is verify-or-close.

Accepted brainstorm: `plans/reports/brainstorm-260901-0228-crm-ai-parity.md`.

## Scope Challenge

- Existing: `pinnedWorkIds`, `searchCrm`, `reportStatsForRole`, `RecordTabs`, `objectByApiName`, GraphQL/MCP `dashboardStats` pattern, `listRecords(q)`, MCP `get_record`.
- Requested: full scope B. No `--yagni`.
- Complexity: ~20 files, 0 new services, 5 sequential phases (shared `schema.ts` / `mcp/tools.ts`).
- Selected mode: **HOLD SCOPE**. Auto-detect: skip extra researchers (brainstorm is the evidence packet). Not `--parallel` (file overlap).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Agent tab on `/objects/{apiName}/{id}` with grounded `loadRecordContext` | P1 |
| 2 | GraphQL `reportStats` + MCP `get_report_stats` | P1 |
| 3 | Custom-object hits in `searchCrm` + palette ⌘K | P1 |
| 4 | GraphQL/MCP pipeline + stage **reads** (writes stay REST) | P1 |
| 5 | Login hydration verify-or-close; freeze schema; honest MCP catalog; docs | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Agent tab on custom objects](./phase-01-start.md) | Pending |
| 2 | [Report stats GraphQL + MCP](./phase-02-report-stats-graphql-mcp.md) | Pending |
| 3 | [Custom-object search](./phase-03-custom-object-search.md) | Pending |
| 4 | [Pipeline/stage reads](./phase-04-pipeline-stage-reads.md) | Pending |
| 5 | [Hydration, freeze, catalog, docs](./phase-05-hydration-freeze-catalog-docs.md) | Pending |

## Design decisions (locked)

- Reuse helpers. No new queue, DB, or pipeline DDL. No migration (`ai_conversations.entityType` is already `text`).
- Pipeline **reads only**. `updateDeal(stageId)` already moves deals. Writes stay REST unless an extract is already sitting in the REST route (it is not — skip).
- Search: extend `searchCrm` + palette mapper. No fourth search function.
- Agent: CRM enum **or** `objectByApiName` hit; `permissionObjectFor` → `objects` for custom. Titles via `recordTitle()` lifted out of the App Router folder.
- MCP catalog: bump on the **first** new tool (phase 2), then keep `N tools` honest. Expected end state: 36 → 39 (`get_report_stats`, `list_pipelines`, `get_pipeline`).
- GraphQL freeze: copy `printSchema(fourtySchema())` into `tests/fixtures/graphql-schema.graphql`. Never invent field order.
- Tests against `fourty-vitest-pg :5439` / `fourty_test`. Do not point vitest at host `:5432`.
- GraphQL `Record.object` (apiName) is a real schema field, not only a JS row property.
- Reserve singular `contact` / `company` / `deal` apiNames (plus existing plural RESERVED).
- No `POST /api/ai/conversations`. Bindings go through `GET /api/ai/conversations` + `POST /api/ai/chat`.
- No MCP `list_stages`. Catalog end state stays **39**.

## Non-goals

CSV import expansion; admin GraphQL/MCP (workflows, webhooks, members, audit, field-perms, api-keys, SSO, saved-views, import/export); `get_note`/`get_activity`; speculative login overlay patch; facts on custom objects; committing the dirty tree; pipeline/stage writes.

## Success Criteria

- [x] Custom-object detail has Timeline \| Agent; thread binds `entityType=apiName`; missing/forbidden → 404
- [x] `{ reportStats { sourceBreakdown { source leads } } }` and MCP `get_report_stats` match REST `/api/stats/reports`
- [x] Prefix search (GraphQL/MCP) and infix palette include custom-object hits (`type` = apiName, cap 25, `%`/`_` empty)
- [x] GraphQL `pipelines` / `pipeline(id)` / `stages` and MCP list/get return the same rows as REST GET `/api/pipelines`
- [x] `/login` in `next dev`: no hydration console error and Next badge `data-error=false` after compile — or documented closed-as-non-issue
- [x] `npx tsc --noEmit` clean; focused vitest green; docs + catalog match shipped tools

## Dependencies

- Brainstorm report (accepted scope B)
- Existing GraphQL freeze test in `tests/action-contacts.test.ts`
- MCP catalog lock in `tests/mcp-catalog.test.ts`

## Validation Log

### Session 1 — 2026-09-01
**Trigger:** `/ak:plan validate` after plan fill (user chose validate at post-plan handoff)
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** GraphQL `Record` has no `object` field (apiName only on the JS row for children). How should search hits expose apiName?
   - Options: Add `Record.object: String` (Recommended) | `SearchRecord { object, record }` | GraphQL search.records without object
   - **Answer:** Add `Record.object: String` (Recommended)
   - **Rationale:** Additive; `record()` / `records()` / `search.records` share one shape; child resolvers already read `row.object`.

2. **[Assumptions]** Phase 1 said “conversations GET/POST”. Code has GET only; new threads are `POST /api/ai/chat`.
   - Options: GET conversations + chat parseRecord/loadRecordContext (Recommended) | Add POST /api/ai/conversations
   - **Answer:** GET conversations + chat parseRecord/loadRecordContext (Recommended)
   - **Rationale:** Do not invent a route. Five `isRecordEntity` sites: `chat/route.ts` ×3, `conversations/route.ts` GET, `conversations/[id]/route.ts`.

3. **[Risks]** RESERVED is plurals (`contacts`, …). Singular `contact|company|deal` can still be created and collide with the CRM Agent enum.
   - Options: Add singular names to RESERVED (Recommended) | Keep RESERVED, CRM enum wins | objectByApiName wins CRM enum
   - **Answer:** Add `contact`, `company`, `deal` to RESERVED (Recommended)
   - **Rationale:** One Set, 409 on create. Prevents Agent/⌘K routing a custom object to the contacts table.

4. **[Scope]** MCP `list_stages` vs nested stages on `list_pipelines` / `get_pipeline` (GraphQL still has `stages(pipelineId:)`).
   - Options: No, catalog 39 (Recommended) | Add `list_stages` → 40
   - **Answer:** No. Catalog 39 (Recommended)
   - **Rationale:** Agents already move deals via `update_deal(stageId)`. Extra tool is catalog churn without new capability.

#### Confirmed Decisions
- `Record.object`: add GraphQL field — search clients can read apiName
- AI routes: no conversations POST — chat + conversations GET + conversations/[id] GET
- RESERVED: add singular CRM names in phase 1
- MCP: no `list_stages`; 36 → 37 (phase 2) → 39 (phase 4)

#### Action Items
- [x] Propagate the four decisions into phases 1, 3, 4 and design-decisions
- [ ] Cook only after whole-plan sweep reports 0 contradictions

#### Impact on Phases
- Phase 1: drop conversations POST; add RESERVED singular + test; list the five `isRecordEntity` sites
- Phase 3: add `object` field on GraphQL `Record` (not a SearchRecord wrapper)
- Phase 4: keep MCP without `list_stages` (already the plan; lock it)

### Verification Results
- **Tier:** Full (5 phases, 4 roles)
- **Claims checked:** 42
- **Verified:** 38 | **Failed:** 3 | **Unverified:** 1

#### Failures (corrected via interview)
1. [Contract Verifier] Phase 1 “conversations GET/POST” — `src/app/api/ai/conversations/route.ts` exports **GET only**. Threads are created in `POST /api/ai/chat`. `isRecordEntity` sites: chat 111, 128, 199; conversations GET 24; conversations/[id] 29.
2. [Fact Checker] GraphQL `Record` (`schema.ts:463-471`) has id/createdAt/updatedAt/data + children. `object` is attached in JS (`schema.ts:699,709`) but is **not a schema field**. Search cannot expose apiName without adding it.
3. [Fact Checker] RESERVED (`src/app/api/custom-objects/route.ts:10-20`) is `contacts|companies|deals|tasks|notes|activities|pipelines|stages|workflows`. Singular `contact` is legal (`API_NAME_RE` min 2). CRM enum would steal Agent/search.

#### Unverified
1. [Flow Tracer] Login overlay 2026-09-01 `data-error=false` was live-checked in a prior session; not re-probed this validate. Phase 5 remains verify-or-close.

#### Verified (sample)
- `RECORD_ENTITIES` / `isRecordEntity` — `src/lib/ai/record-context.ts:18-22`
- `ai_conversations.entityType` is `text` — `src/db/schema.ts:657` (no migration)
- `pinnedWorkIds(entityType: string, entityId: string)` already accepts custom apiName — `src/lib/pinned-tasks.ts:35`
- `recordTitle` in `src/app/(app)/objects/[apiName]/shared.ts:5`
- `RecordTabs` union — `record-tabs.tsx:27`, `agent-panel/index.tsx:65`
- Custom detail has Timeline, not RecordTabs — `record-detail.tsx:161`
- `reportStatsForRole` — `src/lib/services/stats.ts:297`; REST `src/app/api/stats/reports/route.ts`
- GraphQL `dashboardStats` gate `contacts` read — `schema.ts:738-743`
- MCP `TOOLS` length 36 (36 `name:` entries in `src/mcp/tools.ts`)
- Freeze test — `tests/action-contacts.test.ts:82-83`
- `searchCrm` callers: GraphQL `schema.ts:722`, MCP `tools.ts:170`, REST `api/search/route.ts:8`
- GraphQL search `%` empty — `tests/graphql.test.ts:159-163`
- `Deal.stage` type `DealStage` — `schema.ts:226,277` (`Stage` name free)
- REST GET `/api/pipelines` private `listPipelines` + `ensureDefaultPipeline` — `pipelines/route.ts:12-25`
- No GET on `/api/stages` (POST only)
- `tests/pipelines.test.ts` exists (REST writes)
- Catalog strings “36 tools”: README, why-fourty, key-features, mcp.md, llms.txt, CHANGELOG
- `command-palette` type union — `command-palette.tsx:21`
- `listRecords` infix `ilike` on `data` — `custom-objects.ts:121-122`

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-report-stats-graphql-mcp.md, phase-03-custom-object-search.md, phase-04-pipeline-stage-reads.md, phase-05-hydration-freeze-catalog-docs.md
- Decision deltas checked: 4 (`Record.object`, no conversations POST, RESERVED singular, no `list_stages` / catalog 39)
- Reconciled stale references: 3 (phase 1 “conversations GET/POST” / list/create; phase 3 GraphQL files line now includes `Record.object`; phase 4 `list_stages` locked 39)
- Unresolved contradictions: 0

<!-- slug: crm-ai-parity -->

