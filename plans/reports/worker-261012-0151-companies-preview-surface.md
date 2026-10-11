# Companies toolbar, table surface, and preview

Status: DONE_WITH_CONCERNS

## Scope

- Replaced the Companies ad-hoc filter row with the shared `ContextToolbar` slots while keeping existing URL updates, search debounce, saved views, export, selection, pagination, and preview focus behavior.
- Removed the duplicated `input` base class from Companies `Select` triggers and kept explicit desktop/mobile widths.
- Added a localized mobile horizontal-scroll cue and selected-row data/class surface; table semantics and selection controls remain native.
- Restructured `CompanyPreview` into conditional labelled sections backed only by fields present in `CompanyRead`.
- Added matching English/Vietnamese catalog keys for the cue and preview headings.

## Validation

- `npx vitest run tests/i18n.test.ts --reporter=dot` — passed (9 tests).
- `git diff --check` for owned files — passed.
- The owned i18n and diff checks pass. Full type/design-system checks are currently waiting on the shared foundation exports (`ContextToolbar`, `AsyncError`, and the updated `Spinner`) being added by the foundation work.

## Concerns

- Do not consider the shared typecheck/runtime gate complete until the foundation exports land; then rerun focused design/i18n/a11y checks and the Companies Playwright journeys.
