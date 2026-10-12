# Companies E2E reconciliation

## Changes

- Kept the existing `listChanged` guard in `src/app/(app)/companies/companies-client.tsx` and removed the preview-sensitive `query` object identity from the company-list fetch effect dependencies. Opening a preview now preserves the selected row and does not issue another list request.
- Replaced the two legacy resizable-sidebar journeys in `e2e/companies.spec.ts` with checks for the current shadcn icon sidebar: trigger and rail clicks, `sidebar_state` cookie values and reload persistence, Meta/Ctrl+B toggling, and an unprevented Meta/Ctrl+R event. No localStorage width behavior remains in the Companies spec.
- Updated nested palette handling so closing the top layer returns focus to the
  open preview, while a preview removed by browser Back falls back to the
  visible shell search trigger instead of `document.body`.
- Updated the detail-page helpers in `e2e/record-detail.spec.ts` and `e2e/views.spec.ts` to activate the real company name anchor.

## Validation

- `npx tsc --noEmit --pretty false` — passed.
- `npx playwright test e2e/companies.spec.ts e2e/record-detail.spec.ts e2e/views.spec.ts --list` — passed; 38 tests discovered.
- `git diff --check` — passed.
- Source guard confirmed the Companies spec has no legacy `localStorage` width, separator resize, or `aria-valuenow` assertions.

Controller follow-up ran the complete production Playwright suite (107/107),
the complete development-mode suite (14/14), and the focused Back → Escape
focus regression after final review; all passed.

Status: DONE
Summary: Companies list fetching, sidebar journeys, nested focus assertions, and company detail navigation now match the active UI contracts.
Concerns/Blockers: None.
