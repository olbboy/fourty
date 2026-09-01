---
phase: 4
title: "Pipeline/stage reads"
status: pending
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 4: Pipeline/stage reads

## Overview

Hand-wire GraphQL + MCP **reads** for pipelines and stages, matching REST GET `/api/pipelines` (stages nested). Writes stay on REST. Catalog 37 → 39 (`list_pipelines`, `get_pipeline`). Agents already move deals via `update_deal(stageId)`.

## Context Links

- REST list+nested stages: `src/app/api/pipelines/route.ts` (`listPipelines` is file-private; GET also calls `ensureDefaultPipeline()`)
- REST get/patch/delete pipeline: `src/app/api/pipelines/[id]/route.ts` (PATCH/DELETE only — no GET-by-id)
- REST stages: `src/app/api/stages/route.ts` POST only; `src/app/api/stages/[id]/route.ts` PATCH/DELETE — **no GET list**
- RBAC objects: `pipelines`, `stages` in `src/lib/permissions.ts`
- Pattern to copy: GraphQL `dashboardStats` / MCP `get_dashboard_stats` (not the action registry — there is no `src/lib/actions/pipelines`)

## Key Insights

- ADR-017 wants new mutations through the action registry. Reads may hand-wire like dashboard. **Do not** add GraphQL/MCP pipeline writes in this plan (extract is not cheap: create uses `createPipelineWithDefaultStages`, stage insert shifts `order`, delete has 409 constraints).
- REST GET `/api/pipelines` is `withAuth` only (no extra `authorize`). GraphQL/MCP should `requireRbac/requireRole("pipelines", "read")` — viewers already can.
- Call `ensureDefaultPipeline()` on list so an empty workspace still sees the default board, matching REST.
- Nested stages on `Pipeline` is the REST-faithful shape. Also add top-level `stages(pipelineId:)` because acceptance names it. MCP does **not** add `list_stages` — validation session 1 locked catalog **39**. `<!-- Updated: Validation Session 1 - no list_stages -->`

## Requirements

- Functional: GraphQL `pipelines` returns `{ id name createdAt stages { id name type order winProbability color pipelineId } }`. `pipeline(id)` one row or null. `stages(pipelineId:)` filters; omit pipelineId → all workspace stages, ordered. MCP `list_pipelines` / `get_pipeline` match. Missing id → null / MCP not-found. RLS: other workspace empty.
- Non-functional: no writes; no action-registry module; catalog 39.

## Architecture

Extract shared read helper (REST can keep its private function **or** switch to the helper in the same PR — prefer extract so REST/GraphQL/MCP cannot drift):

```ts
// src/lib/services/pipelines.ts
export async function listPipelinesWithStages() {
  await ensureDefaultPipeline();
  const pipelines = await db.select().from(tables.pipelines);
  const stages = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
  return pipelines.map((p) => ({
    ...p,
    stages: stages.filter((s) => s.pipelineId === p.id),
  }));
}

export async function getPipelineWithStages(id: string) {
  const all = await listPipelinesWithStages();
  return all.find((p) => p.id === id) ?? null;
}

export async function listStages(pipelineId?: string) {
  await ensureDefaultPipeline();
  const rows = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
  return pipelineId ? rows.filter((s) => s.pipelineId === pipelineId) : rows;
}
```

REST GET `/api/pipelines` should call `listPipelinesWithStages` (delete the private duplicate).

GraphQL types `Pipeline` + `Stage`. Verified: `Deal.stage` is already type `DealStage` (`schema.ts`) — the name `Stage` is free. Do not rename `Deal.stage`.

MCP:

```ts
{ name: "list_pipelines", mutates: false, ... requireRole(ctx, "pipelines", "read"); return listPipelinesWithStages(); }
{ name: "get_pipeline", mutates: false, input: { id }, ... const row = await getPipelineWithStages(id); if (!row) throw new ToolError("Pipeline not found"); return row; }
```

## Related Code Files

- Create: `src/lib/services/pipelines.ts`
- Modify: `src/app/api/pipelines/route.ts` (use helper)
- Modify: `src/lib/graphql/schema.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `tests/graphql.test.ts`, `tests/mcp.test.ts`, `tests/pipelines.test.ts` (extend)
- Modify: `tests/fixtures/graphql-schema.graphql` from printSchema
- Modify: catalog surfaces to **39 tools** + list the two names
- Docs: `docs/api/graphql.md`, `docs/api/mcp.md`

## Implementation Steps

1. Name the board row type `Stage` (`DealStage` already covers the deal clock).
2. Extract `src/lib/services/pipelines.ts`. Point REST GET at it. Confirm existing pipeline REST tests still pass.
3. Add GraphQL types + `pipelines` / `pipeline(id)` / `stages(pipelineId:)`.
4. Add MCP `list_pipelines` + `get_pipeline`.
5. Tests: list matches REST shape; get unknown id → null; second workspace empty; `stages(pipelineId)` filters; MCP list non-empty after seed; Deal `updateDeal(stageId)` still works (existing test).
6. Freeze fixture. Bump catalog 37 → 39.
7. Do **not** add create/update/delete pipeline or stage on GraphQL/MCP.

## Todo

- [x] Extract `listPipelinesWithStages` / `getPipelineWithStages` / `listStages`
- [x] REST GET uses the helper
- [x] GraphQL `pipelines` / `pipeline` / `stages` (`Stage` type, not `DealStage`)
- [x] MCP `list_pipelines` / `get_pipeline`
- [x] Isolation tests
- [x] Freeze + catalog 39

## Success Criteria

- [x] GraphQL pipelines equal REST GET `/api/pipelines` rows (same ids/names/stage order)
- [x] MCP list/get work under `pipelines` read
- [x] No new write tools/mutations
- [x] `update_deal` / `updateDeal` still moves stages
- [x] Catalog tests green at 39

## Risk Assessment

- **Confusing `Stage` vs `DealStage`.** Signal: Deal clock fields appear on pipeline reads. Response: keep `DealStage` on `Deal.stage`; new `Stage` is the board row (id, name, type, order, winProbability, color, pipelineId).
- **ensureDefaultPipeline in GraphQL read** creates a row on first query. Matches REST. Do not skip it or MCP/GraphQL empty on a fresh workspace while the UI board is not.
- **Temptation to add writes.** Out of scope. If a later plan adds them, they go through `src/lib/actions/` (ADR-017).

## Security Considerations

- `pipelines` read RBAC. RLS on `pipelines` / `stages`.
- get missing id: GraphQL null, MCP tool error — do not leak other workspaces.

## Next Steps

Phase 5: freeze sweep, leftover catalog strings, login verify-or-close, remaining docs/CHANGELOG.
