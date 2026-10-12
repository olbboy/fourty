# UI design system

Fourty uses the shadcn v4 component model on top of Base UI. The executable
owners are [`components.json`](../components.json), the token bridge in
[`globals.css`](../src/app/globals.css), the vendored Tailwind v4 variants in
[`shadcn-tailwind.css`](../src/app/shadcn-tailwind.css), the primitives in
[`src/components/ui/`](../src/components/ui/), and the application adapters in
[`ui.tsx`](../src/components/ui.tsx).

The Tailwind variant and utility layer is source-owned in the repository. It is
vendored from `shadcn@4.21.4`'s `dist/tailwind.css` under its MIT license, so the
application keeps the shadcn/Base UI design contract without carrying the
shadcn CLI's registry dependency tree into installs. Refresh the vendored file
deliberately when the shadcn Tailwind layer changes and review the resulting CSS
alongside the component tests.

Feature screens own data, URL state, and request lifecycles. Shared primitives
own appearance, focus, dismissal, labelling, and keyboard behavior.

## Component layers

Use the narrowest layer that matches the job:

1. Import a primitive from `@/components/ui/<name>` for buttons, inputs,
   dialogs, sheets, selects, tables, cards, and other shadcn components.
2. Import from `@/components/ui` for Fourty-specific compositions such as
   `PageHeader`, `Field`, `AsyncError`, `ContextToolbar`, `StatusChip`, and
   `KpiCard`.
3. Keep record fetching, mutation state, routing, and domain rules in the
   feature component or server action.

Do not add another primitive wrapper around Radix or hand-written focus
management. Base UI supplies the interaction behavior beneath the shadcn
components.

## Tokens

`globals.css` maps Fourty's palette onto shadcn's semantic tokens, including
`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`,
`--accent`, `--destructive`, `--border`, `--input`, and `--ring`. Product states
use the `--feedback-*`, `--status-*`, `--score-*`, and `--priority-*` families.

Use token-backed utilities such as `bg-background`, `bg-card`, `text-foreground`,
`text-muted-foreground`, `border-border`, `text-feedback-error`, and
`bg-feedback-error-wash`. Add a token to both light and dark themes before
using a new visual value repeatedly.

## Core contracts

| Primitive | Contract |
| --- | --- |
| `Button` | Base UI button with shadcn variants `default`, `outline`, `secondary`, `ghost`, `destructive`, and `link`. Use `buttonVariants()` on a real `Link` or anchor for navigation. |
| `Field` | Fourty adapter that connects a label, stable control ID, hint/error IDs, `aria-describedby`, `aria-invalid`, and required state. |
| `Spinner` | Announces loading through `role="status"`, `aria-live`, and an accessible localized label. A failed request must replace it with a retryable error state. |
| `AsyncError` | Recoverable request failure with `role="alert"`, optional context, and an explicit retry action. |
| `ContextToolbar` | Responsive layout for page-owned search, filters, view controls, actions, and result metadata. It does not own query or request state. |
| `Select` | Base UI/shadcn composable select for custom popup behavior. Use `NativeSelect` when native form semantics are enough. |
| `Dialog` / `Modal` | Base UI dialog owns portal, focus trapping, Escape handling, dismissal, and focus restoration. `Modal` is the app-level composition for existing feature call sites. |
| `Sheet` / `Drawer` | Base UI sheet owns side-panel behavior. `Drawer` is the app-level compatibility composition and must not implement a separate focus stack. |
| `Table` | Shared table markup and horizontal overflow boundary. Domain columns, sorting, selection, and pagination stay in the feature. |

## Accessibility and responsive behavior

- Preserve the global `:focus-visible` ring and give icon-only controls an
  accessible name.
- Use real links for navigation and real buttons for actions. Do not make a row
  clickable without a focusable control that exposes the same destination.
- Keep `prefers-reduced-motion` effective for transitions and animations.
- Coarse-pointer controls must retain a minimum 44px hit area.
- `ContextToolbar` wraps on narrow screens and lets its search slot take a full
  row.
- Tables and Kanban boards that overflow on mobile must stay horizontally
  scrollable and provide a visible continuation cue.
- Let `Dialog`, `Sheet`, `Command`, and `Popover` manage focus and Escape. Add a
  local workaround only when a focused browser test proves a framework gap.

## Verification

When changing the system, run the focused component and accessibility tests:

```bash
npx vitest run \
  tests/a11y.test.ts \
  tests/button-render-as.test.ts \
  tests/design-system.test.ts \
  tests/semantic-tokens.test.ts \
  tests/source-hygiene.test.ts
```

Use `e2e/design-system.spec.ts`, `e2e/dev-warnings.spec.ts`, and the affected
feature spec for portal, keyboard, responsive, and runtime-warning behavior.
