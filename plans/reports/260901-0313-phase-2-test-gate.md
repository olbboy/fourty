---
title: Test Report — Phase 2 Report stats GraphQL + MCP
date: 2026-09-01
slug: phase-2-test-gate
status: pass
---

# Test Report — 260901-0313 — phase-2 test gate

Scope: `npx tsc --noEmit` + 4 vitest files listed in phase-2 gate. DSN `:5439`. No source edits.

## Test Results Overview
- **tsc**: PASS (`npx tsc --noEmit`, exit 0, ~1.4s, no output)
- **Total**: 60 tests / 4 files
- **Passed**: 60 | **Failed**: 0 | **Skipped**: 0
- **Duration**: 3.08s (tests 1.77s, collect 926ms, transform 214ms)
- **Vitest**: v3.2.7
- **DSN**: `postgresql://fourty_app@localhost:5439/fourty_test` (migrate: `fourty@localhost:5439`)
- **Postgres**: `localhost:5439` accepting connections (OrbStack)

Per file:
| File | Tests | Time |
|------|-------|------|
| `tests/graphql.test.ts` | 26 | 1139ms |
| `tests/mcp.test.ts` | 25 | 385ms |
| `tests/action-contacts.test.ts` | 7 | 243ms |
| `tests/mcp-catalog.test.ts` | 2 | 2ms |

## Coverage Metrics
Not run. Gate commands did not include `--coverage`.

| Metric   | Value | Threshold | Status |
|----------|-------|-----------|--------|
| Lines    | n/a   | 80%       | SKIP |
| Branches | n/a   | 70%       | SKIP |
| Functions| n/a   | 80%       | SKIP |

## Failed Tests
None.

## Diff-aware note
User overrode default mapping with an explicit 4-file list.

Mapped (explicit, Strategy A + user list):
- GraphQL schema / `reportStats` → `tests/graphql.test.ts`
- MCP tools / `get_report_stats` → `tests/mcp.test.ts`
- MCP catalog lock (37 tools) → `tests/mcp-catalog.test.ts`
- contacts action / related mutations → `tests/action-contacts.test.ts`

Ran 60 tests (explicit phase-2 list): 60 passed, 0 failed.

## Build Status
- **tsc**: PASS
- **vitest**: PASS
- **Warnings**: pg `DeprecationWarning` in graphql + mcp files — `client.query()` while another query is in flight (pg@9 will remove). Not a fail.
- **Dependencies**: resolved (npx vitest + tsc ran)

## Critical Issues
None blocking.

## Recommendations
1. Low: fix nested `client.query()` in test/setup before pg@9.
2. Later: full suite / coverage when merging the dirty tree — this gate is not a merge bar for the whole working copy.

## Next Steps
1. Phase-2 implementer can treat this gate as green.
2. Do not point later vitest at host `:5432`.

## Unresolved Questions
- None.
