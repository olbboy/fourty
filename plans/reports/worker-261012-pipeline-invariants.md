# Pipeline stage invariants

## Root cause

The nested stage POST route appended stages after Won/Lost and accepted a caller supplied `type`. Its DELETE route only rejected the final remaining stage, so terminal stages and the final open stage could be removed. Both PATCH routes still accepted `type`; the Settings dialog exposed that field as an editor. The pipeline Settings E2E used broad button-name locators, so names such as `Sales` and `Partner` matched save/delete controls as well as the pipeline selector.

## Changes

- Added shared pipeline service helpers for open-stage creation and stage deletion conflicts.
- Both flat and nested POST routes now create open stages before the first Won/Lost stage and preserve contiguous ordering.
- Both flat and nested PATCH routes reject stage type changes while retaining terminal probability validation and score recomputation.
- Both DELETE routes reject Won/Lost and preserve at least one open stage; occupied-stage checks remain in place.
- Removed the Settings stage type editor and type payload; the row still presents the current type as read-only status. The new-stage colour fallback now follows the documented warm-neutral colour.
- Updated pipeline unit assertions for the shared invariants and adjusted pipeline-settings E2E mocks/selectors without weakening behaviour assertions.

## Verification

- `TEST_DATABASE_URL=postgresql://fourty_app:fourty_app@127.0.0.1:55447/fourty_test TEST_MIGRATE_DATABASE_URL=postgresql://fourty:fourty@127.0.0.1:55447/fourty_test npm test -- tests/pipelines.test.ts --run` — 32/32 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npx playwright test --config playwright.config.ts --list e2e/pipeline-settings.spec.ts e2e/settings.spec.ts` — 16 tests discovered.
- `git diff --check` — passed.

Playwright runtime was not started, per the controller-owned server constraint. The default Vitest DSN could not authenticate; the isolated worktree Postgres DSN above was available and passed.

Status: DONE
Summary: Flat and nested pipeline stage routes now share the requested invariants, and Settings/E2E contracts match the documented immutable stage type.
Concerns/Blockers: `docs/api/rest.md` still describes stage type updates, but it was outside the explicitly allowed edit list; no runtime E2E server was started.
