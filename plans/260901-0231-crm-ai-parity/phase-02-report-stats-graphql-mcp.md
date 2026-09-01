---
phase: 2
title: "Report stats GraphQL + MCP"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Report stats GraphQL + MCP

## Overview

Expose `reportStatsForRole` on GraphQL and MCP the same way `dashboardStats` / `get_dashboard_stats` already wrap `dashboardStatsForRole`. First new MCP tool — bump catalog 36 → 37 everywhere the count is asserted.

## Context Links

- REST: `src/app/api/stats/reports/route.ts`
- Service: `src/lib/services/stats.ts` (`computeReportStats`, `applyFieldPolicyToReports`, `reportStatsForRole`)
- Pattern: GraphQL `dashboardStats` in `src/lib/graphql/schema.ts`; MCP `get_dashboard_stats` in `src/mcp/tools.ts`
- Catalog lock: `tests/mcp-catalog.test.ts`

## Key Insights

- Reports already apply field-permissions: `amountUsd` dropped when `deals.amount` hidden; `overdue` dropped when `expectedCloseDate` hidden; stage name follows `stageId`.
- GraphQL fields for redacted keys must be **nullable**. Do not mark `amountUsd` / `overdue` / `stage` as NonNull.
- Workspace isolation is RLS inside `reportStatsForRole` — same as dashboard. Test with two workspaces like existing `dashboardStats` tests in `tests/graphql.test.ts`.
- `tests/mcp-catalog.test.ts` fails until README, `docs/api/mcp.md`, `docs/getting-started/{why-fourty,key-features}.md`, and `public/llms.txt` all say **37 tools** and list `get_report_stats`.

## Requirements

- Functional: `{ reportStats { sourceBreakdown { source leads customers conversion } winLoss { month won lost } aging { id name } scoreBands { band count } statusBreakdown { status count } } }` returns the REST payload. MCP `get_report_stats` (no args) same. Viewer with hidden amount gets null/omitted amount fields, not zeros.
- Non-functional: additive schema only; no new REST; catalog honest.

## Architecture

Mirror dashboard:

```ts
// GraphQL
reportStats: {
  type: new GraphQLNonNull(ReportStats),
  resolve: async (_r, _a, ctx) => {
    requireRbac(ctx, "contacts", "read"); // same gate as dashboard + REST withAuth
    return reportStatsForRole(ctx.auth.role);
  },
}

// MCP
{
  name: "get_report_stats",
  mutates: false,
  description: "Return CRM report analytics (source conversion, win/loss, pipeline aging, score bands).",
  inputSchema: { type: "object", properties: {} },
  handler: async (_args, ctx) => {
    requireRole(ctx, "contacts", "read");
    return reportStatsForRole(ctx.role);
  },
}
```

Types (nullable where policy deletes keys):

- `ReportSourceRow`: source, leads, customers, conversion
- `ReportWinLossRow`: month, won, lost
- `ReportAgingRow`: id, name, stage?, amountUsd?, daysInStage?, expectedCloseDate?, overdue?, score?
- `ReportScoreBand`: band, count
- `ReportStatusRow`: status, count

Place the MCP tool next to `get_dashboard_stats`.

## Related Code Files

- Modify: `src/lib/graphql/schema.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `tests/graphql.test.ts` (workspace isolation + field-policy on aging)
- Modify: `tests/mcp.test.ts` (or the file that covers `get_dashboard_stats`)
- Modify: `tests/fixtures/graphql-schema.graphql` — **from printSchema**, not by hand
- Modify: `README.md`, `docs/api/mcp.md`, `docs/api/graphql.md`, `docs/getting-started/why-fourty.md`, `docs/getting-started/key-features.md`, `public/llms.txt`
- Catalog test file itself should not hardcode `36` — it already uses `TOOLS.length`. Docs must match.

## Implementation Steps

1. Add GraphQL types + `reportStats` query. Import `reportStatsForRole`.
2. Add MCP `get_report_stats`.
3. Vitest: two-workspace isolation (copy dashboardStats pattern). Viewer/member field-policy: aging `amountUsd` null/absent when amount hidden.
4. `node -e` or a tiny vitest assertion already in `tests/action-contacts.test.ts`: update fixture with `printSchema(fourtySchema())`.
5. Bump every `N tools` string to 37; add `get_report_stats` to the Read list in `docs/api/mcp.md` and `public/llms.txt`.
6. `npx vitest run tests/mcp-catalog.test.ts tests/graphql.test.ts tests/action-contacts.test.ts tests/mcp.test.ts`

## Todo

- [x] GraphQL `ReportStats` types + `reportStats` query
- [x] MCP `get_report_stats`
- [x] Isolation + field-policy tests
- [x] Freeze fixture from printSchema
- [x] Catalog 36 → 37 on every advertised surface

## Success Criteria

- [x] GraphQL `reportStats.sourceBreakdown` matches REST
- [x] MCP tool listed in `TOOLS` and docs
- [x] `tests/mcp-catalog.test.ts` green
- [x] Freeze test green

## Risk Assessment

- **NonNull on a redacted field.** Signal: GraphQL error for viewer. Response: make aging amount/stage/overdue nullable; add the viewer test before calling done.
- **Catalog count drift** if docs bump but llms.txt tool list omits the name. Signal: mcp-catalog name-set mismatch. Response: add the snake_case tick in both Read lists.
- **printSchema order.** Signal: giant fixture diff. Response: replace the whole fixture file from printSchema output; do not patch hunks.

## Security Considerations

- RBAC: `contacts` read (same as dashboard). RLS: workspace from context.
- Field-permissions reused; do not reimplement redaction.

## Next Steps

Phase 3 (search). Schema will change again — freeze will be rewritten in 3 and 4; that is expected.
