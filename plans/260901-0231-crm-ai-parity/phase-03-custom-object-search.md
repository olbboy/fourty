---
phase: 3
title: "Custom-object search"
status: pending
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Custom-object search

## Overview

Extend the one shared `searchCrm` so custom-object records appear on GraphQL `search`, MCP `search`, and the REST command-palette (`/api/search` infix + ⌘K). Titles use `recordTitle()`. Cap stays 25. `%`/`_` still empty.

## Context Links

- `src/lib/services/search.ts` — contacts/companies/deals only today
- `src/app/api/search/route.ts` — palette mapper
- `src/components/command-palette.tsx` — `type: "contact" | "company" | "deal"`
- GraphQL `SearchResult` — contacts/companies/deals + optional `note`
- MCP `search` handler — spreads `searchCrm` hits
- Per-object list filter already exists: `listRecords(objectId, { q })` does infix `ilike` on `custom_records.data`

## Key Insights

- Palette is **infix**; MCP/GraphQL are **prefix**. Custom hits must honor `opts.mode`.
- `custom_records.data` is a JSON **text** column. Raw `ilike` on the JSON string is good enough for contains (listRecords already does this) and bad for prefix (`{"name":"Acme"`). For prefix: fetch candidates with contains, then keep rows whose `recordTitle` or any string field value starts with the term (case-insensitive).
- GraphQL `Record` type already exists but **has no `object` field** (`schema.ts:463-471`). apiName is only on the JS row (`{ ...r, object }`) for child resolvers. Add `object: GraphQLString` (non-null) on `Record`. Then add `records` to `SearchResult`. `<!-- Updated: Validation Session 1 - Record.object field -->`
- Do not fail the whole search if the caller cannot read `objects` — skip custom hits.
- Empty term (`%`/`_` stripped to nothing) returns empty arrays **including** `records: []`.
- MCP description still says "contacts, companies, and deals" — update it.

## Requirements

- Functional: prefix search finds a custom record by title prefix; palette infix finds it in the middle; hit exposes `type` (apiName) + id + title; navigating ⌘K goes to `/objects/{apiName}/{id}`; cap 25 per existing buckets (custom bucket also ≤25, existing CRM buckets unchanged).
- Non-functional: no fourth search function; no fuzzy; RLS on `custom_records`.

## Architecture

```ts
export type CrmSearchHits = {
  contacts: Record<string, unknown>[];
  companies: Record<string, unknown>[];
  deals: Record<string, unknown>[];
  records: Array<{ id: string; object: string; data: Record<string, unknown>; title: string; createdAt: number; updatedAt: number }>;
};
```

Inside `searchCrm`, after CRM queries:

1. If `!can(role, "objects", "read")` → `records: []`.
2. `listObjects()`. For each object, `listRecords(obj.id, { q: term, limit })`.
3. If mode is `prefix`, filter to rows where `recordTitle` or a string field starts with `term` (case-insensitive). Contains mode keeps the SQL hits.
4. Map `{ ...row, object: obj.apiName, title: recordTitle(row.data, fields) }`. Concatenate, slice to `limit`.

GraphQL: add `object` on `Record` (apiName). `search` resolver passes `records` (each row already needs `object` for `customRecordChildren`). Empty-note condition includes `records.length === 0`. Do not invent a `SearchRecord` wrapper.

REST `/api/search`: map records to `{ type: object, id, title, subtitle: objectNameSingular or apiName }`.

⌘K: widen `SearchResult.type` to `string`. `TYPE_PATH` fallback: `/objects/${type}/`. Use existing `Box` icon for non-CRM types.

## Related Code Files

- Modify: `src/lib/services/search.ts`
- Modify: `src/lib/graphql/schema.ts` (`Record.object` + `SearchResult.records`)
- Modify: `src/mcp/tools.ts` (description + empty-note check)
- Modify: `src/app/api/search/route.ts`
- Modify: `src/components/command-palette.tsx`
- Modify: `tests/graphql.test.ts` (search hits include records)
- Modify: `tests/mcp.test.ts` (if search is covered)
- Modify: `tests/command-palette-search.test.ts` (and/or `tests/command-palette-objects.test.ts`)
- Modify: `tests/fixtures/graphql-schema.graphql` from printSchema
- Create: `tests/search.test.ts` if mapper/prefix-filter needs a focused unit/integration test without GraphQL
- Docs: `docs/api/graphql.md`, `docs/api/mcp.md` search bullets — can land here or phase 5; prefer here.

## Implementation Steps

1. Extend `CrmSearchHits` + implement custom-object branch with prefix filter.
2. Add `Record.object`. Update `SearchResult.records` and empty-note logic. Freeze will show the new field on `Record` as well as `SearchResult`.
3. Update MCP `search` description and empty-note logic.
4. Palette REST mapper + command-palette routing/icons.
5. Tests: seed object + record titled `Orion Ticket`; prefix `Ori` hits GraphQL/MCP; infix `icket` hits `/api/search`; `%` → empty; other workspace → empty; role without objects → CRM hits only.
6. Freeze schema from printSchema.
7. Browser: ⌘K a custom record title, Enter, land on detail.

## Todo

- [x] `searchCrm` returns `records` with `object` + `title`
- [x] Prefix filter on title/string fields (not raw JSON prefix)
- [x] GraphQL `Record.object` + `SearchResult.records`
- [x] MCP search description + empty note
- [x] REST palette mapper + ⌘K href `/objects/{apiName}/{id}`
- [x] Tests + freeze fixture

## Success Criteria

- [x] GraphQL/MCP prefix search returns the custom record
- [x] ⌘K infix search navigates to the custom record
- [x] Cap 25; empty term → no match-all
- [x] Freeze + catalog tests still green (catalog count unchanged this phase)

## Risk Assessment

- **N+1 over many object types.** Signal: search latency with dozens of types. Response: still acceptable for v1 (workspaces have few types). If needed later, one `ilike` on `custom_records` then join objects — do not build that now.
- **JSON `ilike` false positives** (`"type":"ticket"` matching `tick`). Prefix-mode JS filter on field values reduces this. Contains-mode palette may still over-hit — accept; listRecords already has this behavior.
- **⌘K type union exhaustiveness.** Signal: runtime navigate to `/contacts/<uuid>` for a custom type. Response: default href `/objects/${type}/`.

## Security Considerations

- Skip custom hits when `objects` read is denied; do not 403 the whole search.
- RLS on `custom_records` / `custom_objects`.
- Title is not field-permission redacted (ADR-011 does not apply).

## Next Steps

Phase 4 (pipelines). Search schema change is independent of pipeline types.
