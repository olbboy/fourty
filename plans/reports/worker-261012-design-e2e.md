# Design-system E2E fixes

## Changes

- Raised the mobile shell sidebar trigger, search, theme, and sign-out controls to the 44px touch target.
- Rendered deal names as focusable links in both Kanban cards and list rows while retaining container navigation and drag behavior.
- Fixed the custom-field empty-state interpolation so English renders `companies` instead of `companys`; the label comes from the active locale's navigation catalog.
- Updated the design-system E2E selectors to the shadcn `Sidebar` data attributes and `[data-slot=card]`, keeping the existing navigation and pluralization assertions and leaving retry `role=alert` tests unchanged.

## Validation

- `npm test -- tests/i18n.test.ts tests/design-system.test.ts` — 2 files, 29 tests passed.
- `npm test -- tests/deals-board.test.ts tests/custom-fields-load.test.ts` — 2 files, 5 tests passed.
- `npx tsc --noEmit` — passed.
- `npx playwright test e2e/design-system.spec.ts --list --config playwright.config.ts` — 16 tests discovered; no server started.
- `git diff --check` — passed.

Status: DONE
Summary: Implemented the scoped mobile shell, deal-link, company-pluralization, and shadcn E2E selector fixes.
Concerns/Blockers: Full Playwright execution was not run because the task requested discovery only and no long-running server should be started.
