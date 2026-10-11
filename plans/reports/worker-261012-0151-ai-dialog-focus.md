# AI chat shared dialog focus

- Updated `src/components/ai-chat.tsx` to import and render `DialogFocusScope` as the drawer's actual `role="dialog"` surface.
- Preserved `aria-modal`, localized `aria-label`, drawer styles, outside-click close, input autofocus timer, streaming/restore/send/decision flows, and confirmation rendering.
- Added `tabIndex={-1}` so the shared scope can focus the surface and restore nested focus correctly.
- Removed the private `onKeyDown` Escape handler; Tab/Escape and focus restoration now come from the shared stack.

Validation:

- `npx vitest run tests/design-system.test.ts -t "AI chat uses DialogFocusScope" --reporter=dot` — passed (1 test; 15 skipped).
- `npx vitest run tests/a11y.test.ts --reporter=dot` — passed (8 tests).
- `npx tsc --noEmit --pretty false` — passed.
- `git diff --check` — passed.
- Full focused design-system run is currently red on 15 pre-existing foundation assertions (semantic tokens and Button/IconButton/Field/AsyncError/Spinner exports), outside this file and owned by the shared UI foundation work.

Status: DONE
Summary: AI chat now uses the shared DialogFocusScope boundary with outside close, accessible dialog attributes, shared Tab/Escape handling, and focus restoration while retaining its chat lifecycle.
Concerns/Blockers: Full `tests/design-system.test.ts` remains blocked by concurrent foundation changes not present in this checkout; the AI-specific contract, a11y suite, typecheck, and diff check pass.
