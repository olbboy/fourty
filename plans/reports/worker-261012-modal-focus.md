# Modal focus and LoadError regression

## Outcome

- Removed the `Modal` `requestAnimationFrame` focus override from `src/components/ui.tsx`.
- Base UI `Dialog.Popup` now owns initial focus, using its documented default of the first tabbable element (and its existing focus restoration on close).
- Restored `role="alert"` on both full and compact `LoadError` branches.
- Added focused source/render assertions in `tests/design-system.test.ts` for modal focus ownership and both error variants.

## Evidence

Base UI 1.7.0's `DialogPopup` resolves an omitted `initialFocus` to its default resolver. `FloatingFocusManager` then focuses the first tabbable element, while retaining return-focus handling. The removed app effect ran on a later animation frame and moved focus back to the popup.

Validation:

- `npx vitest run tests/design-system.test.ts --reporter=dot` — passed (19 tests).
- `npx vitest run tests/a11y.test.ts --reporter=dot` — passed (23 tests).
- `npx tsc --noEmit --pretty false` — passed.
- `git diff --check -- src/components/ui.tsx tests/design-system.test.ts` — passed.

Status: DONE
Summary: Modal focus now follows Base UI's first-tabbable contract while retaining Base UI close and restoration behavior; LoadError announcements are restored for full and compact states.
Concerns/Blockers: None.
