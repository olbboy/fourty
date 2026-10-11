# Mobile shell and Settings accessibility fixes

Status: DONE_WITH_CONCERNS

Implemented the assigned changes in:

- `src/components/shell.tsx`
- `src/app/(app)/settings/settings-client.tsx`

The mobile header now exposes an accessible `Open navigation menu` button with a
shared `Drawer` titled `Navigation`. The drawer maps the existing `NAV` source,
keeps active route state, and closes when a route link is selected. The existing
five item mobile bottom navigation remains in place. Mobile header controls and
bottom navigation links have local 44px minimum height/width classes. Desktop
navigation, sidebar resizing, and search behavior were preserved.

Settings now gives active member removal controls an accessible name of
`Remove <member name>`. Custom field entity labels use an explicit plural map so
the company tab and empty state read `Companies` and `companies`.

Validation:

- `npx vitest run tests/a11y.test.ts --reporter=dot` — passed, 8 tests.
- `git diff --check` — passed.
- `npx tsc --noEmit --pretty false` — currently fails in concurrent changes to
  `src/app/(app)/contacts/contacts-client.tsx`, which imports `AsyncError` and
  `ContextToolbar` before the foundation work exports them from `ui.tsx`.
- Focused Playwright discovery could not start because E2E database preparation
  failed with PostgreSQL authentication error `28P01` for user `fourty`.

Concerns/Blockers: Re-run typecheck and focused Playwright after the concurrent
foundation exports and E2E database credentials are available.
