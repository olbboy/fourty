---
title: Test Report — Phase 1 Agent tab on custom objects
date: 2026-09-01
slug: phase-1-test-gate
status: pass
---

# Test Report — 260901-0300 — phase-1 test gate

Scope: `npx tsc --noEmit` + 7 vitest files listed in phase-1 gate. DSN `fourty-vitest-pg` `:5439`. No source edits.

## Test Results Overview
- **tsc**: PASS (`npx tsc --noEmit`, exit 0, ~1.9s, no output)
- **Total**: 28 tests / 7 files
- **Passed**: 28 | **Failed**: 0 | **Skipped**: 0
- **Duration**: 2.07s (tests 908ms, collect 481ms)
- **Vitest**: v3.2.7
- **DSN**: `postgresql://fourty_app@localhost:5439/fourty_test` (migrate: `fourty@localhost:5439`)
- **Container**: `fourty-vitest-pg` Up 39h, `0.0.0.0:5439->5432/tcp`

Per file:
| File | Tests | Time |
|------|-------|------|
| `tests/custom-objects.test.ts` | 5 | 589ms |
| `tests/record-context.test.ts` | 4 | 303ms |
| `tests/custom-object-pages.test.ts` | 2 | 9ms |
| `tests/custom-object-fields-load.test.ts` | 2 | 2ms |
| `tests/ai-chat-load.test.ts` | 7 | 2ms |
| `tests/agent-panel-load.test.ts` | 5 | 2ms |
| `tests/custom-object-display.test.ts` | 3 | 1ms |

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
User overrode default mapping with an explicit 7-file list. Working tree has a large dirty set (phase-1 + other in-progress CRM/AI work). Config files also dirty (`.github/workflows/ci.yml`, `package.json`) — default QA policy would auto-escalate to full suite. Not done here.

Mapped (explicit, Strategy A + user list):
- `src/lib/ai/record-context.ts` → `tests/record-context.test.ts`
- `src/lib/custom-object-display.ts` → `tests/custom-object-display.test.ts`
- `src/lib/custom-objects.ts` + `src/app/api/custom-objects/route.ts` → `tests/custom-objects.test.ts`
- `src/app/(app)/objects/` → `tests/custom-object-pages.test.ts`
- `src/components/agent-panel/` → `tests/agent-panel-load.test.ts`
- custom-object fields UI load → `tests/custom-object-fields-load.test.ts`
- `src/app/api/ai/chat/route.ts` / AI chat UI → `tests/ai-chat-load.test.ts`

Unmapped vs dirty tree: many other `src/` + `tests/` files not in this gate. Out of scope.

Ran 28 tests (explicit phase-1 list): 28 passed, 0 failed.

## Build Status
- **tsc**: PASS
- **vitest**: PASS
- **Warnings**: pg `DeprecationWarning` in `tests/custom-objects.test.ts` — `client.query()` while another query is in flight (pg@9 will remove). Not a fail.
- **Dependencies**: resolved (npx vitest + tsc ran)

## Critical Issues
None blocking.

## Recommendations
1. Low: fix nested `client.query()` in custom-objects test/setup before pg@9.
2. Later: full suite / coverage when merging the large dirty tree — this gate is not a merge bar for the whole working copy.

## Next Steps
1. Phase-1 implementer can treat this gate as green.
2. Do not point later vitest at host `:5432`.

## Unresolved Questions
- None.
