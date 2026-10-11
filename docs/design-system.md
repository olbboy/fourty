# UI design system

This is the maintainer reference for Fourty's shared UI contracts. The
executable owners are [the semantic stylesheet](../src/app/globals.css),
[shared primitives](../src/components/ui.tsx),
[button primitives](../src/components/button.tsx),
[async error state](../src/components/async-state.tsx),
[context toolbar](../src/components/context-toolbar.tsx), and
[Radix Select wrapper](../src/components/select.tsx). Feature screens own
their data, URL state, and request lifecycle; these shared surfaces own visual
language and interaction boundaries.

## Semantic tokens

`globals.css` defines the same semantic vocabulary in `:root` and `.dark`.
Use the exposed utilities (`bg`, `surface`, `surface-2`, `surface-raised`,
`surface-hover`, `line`, `line-strong`, `ink`, `ink-muted`, `danger`,
`success`, `warning`, and `info`) instead of hard-coding a theme value in a
consumer. The public utility groups are:

- **Surfaces and text:** `bg`, `surface`, `surface-2`, `surface-raised`,
  `surface-hover`, `ink`, and `ink-muted`. These map to the raw CSS variables
  `--text` and `--text-muted` where appropriate.
- **Boundaries and state:** `border`, `border-strong`, `focus-ring`, and the
  `danger`, `success`, `warning`, `info` status colors, including the selected,
  error, and panel state tokens.
- **Shared geometry and motion:** `radius-control`, `radius-surface`,
  `shadow-raised`, `duration-fast`, and `ease-standard`.

Control and surface recipes in the same stylesheet preserve the legacy control
aliases `.input`, `.btn-primary`, `.btn-ghost`, and `.btn-danger`. The shared
`.card`, `.th`, and `.td` recipes remain available to existing table and card
consumers.

## Primitive contracts

Use the primitives through their source modules or the exports from
`components/ui.tsx`.

| Primitive | Contract |
| --- | --- |
| `Button` | Native button by default (`type="button"`), or a link/child element through `href`/`asChild`. `intent`/`variant` is `primary`, `neutral`, or `danger`; `size` is `default` or `compact`. `busy`/`loading` disables a native button and exposes `aria-busy`. |
| `IconButton` | Icon-only native button with a required `aria-label`, safe `type="button"`, shared intent/size recipes, and the same busy/loading behavior. Keep the icon decorative when the label supplies the name. |
| `Field` | Wraps a label and one control. `id`, `required`, `description`/`hint`, and `error` wire `htmlFor`, stable hint/error IDs, `aria-describedby`, `aria-invalid`, and an alerting error message. Keep the control as a valid child when the wrapper must add these attributes. |
| `Spinner` | Announces loading with `role="status"`, `aria-live="polite"`, `aria-busy="true"`, and the supplied accessible label. A fetch failure must switch to an error state instead of leaving the spinner mounted indefinitely. |
| `AsyncError` | Recoverable request failure: `role="alert"`, a message, optional hint, and an explicit retry button. The page supplies retry behavior and retains its route/filter state. |
| `ContextToolbar` | Layout-only `search`, `filters`, `view`, `actions`, and `meta` slots with `role="toolbar"`. Query state, navigation, fetching, and action semantics remain in the feature screen. |
| `DialogFocusScope` | Shared modal focus boundary. When open, it wraps Tab/Shift+Tab, lets only the topmost nested surface handle Escape, and restores focus to the trigger or the main fallback on close. Modal, Drawer, command palette, and AI chat share this stack. |
| `Select` | Radix Select wrapper with controlled/uncontrolled value, placeholder, options, disabled/required state, optional form `name`, and a hidden input for form submission. Its trigger uses the shared control recipe and removes the legacy `input` token if a caller still passes it. |

Surface styling is a recipe rather than a separate React wrapper: `.surface`
provides the raised boundary, with `.surface-subtle`, `.surface-danger`, and
`.surface-compact` for the supported variations. Keep domain content and
stateful behavior in the feature component.

## Accessibility and responsive rules

- Preserve the global `:focus-visible` ring. Icon-only actions need an
  accessible name; record rows and cards need a real link or button in the tab
  order rather than a click-only container.
- Keep `prefers-reduced-motion: reduce` effective. Shared animations and
  transitions are disabled by the global reduced-motion rule.
- Coarse-pointer controls receive a minimum 44px block size. The icon can stay
  visually compact while the hit area remains usable.
- `ContextToolbar` wraps at narrow widths; its search slot becomes a full row.
  Do not move query or fetch state into the toolbar to solve responsive layout.
- On mobile, the shell keeps the primary bottom navigation and exposes the
  complete route tree through the shared navigation drawer. The Companies,
  Contacts, and Deals table/Kanban surfaces remain horizontally scrollable and
  provide a visible cue where fields or stages continue off screen.
- Dialog consumers must use the shared focus scope and preserve nested LIFO
  close behavior. Do not add a second Escape or focus manager inside a feature.

When extending the system, add a semantic token in both themes, use an
existing recipe or primitive, and add a focused render/accessibility test at
the owning test boundary (`tests/design-system.test.ts` and the relevant
feature or E2E spec).
