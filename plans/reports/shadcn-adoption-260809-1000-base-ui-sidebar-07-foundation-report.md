# shadcn/ui adoption — foundation, shell, primitives

Date: 2026-08-09 · Branch: `claude/intelligent-stonebraker-def72a`

Research via grok CLI (web + X) **cross-checked against the live CLI and registry API**.
Where the two disagreed, the CLI won.

## Research findings

Verified by running `shadcn@4.16.2` and fetching `ui.shadcn.com/r/...` directly.

- **`shadcn doctor` does not exist.** Real commands: `init/create`, `apply`, `add`,
  `docs`, `view`, `search/list`, `migrate`, `eject`, `info`, `build`, `mcp`,
  `preset`, `registry`, `diff` (deprecated). Nearest to a doctor: `shadcn info`,
  `shadcn registry validate`, `add --dry-run`, `add --diff`.
- **Base UI is the default since July 2026**, not Radix (`init --base base|radix|aria`).
  Radix is still supported and existing Radix apps need no migration.
  Sources: shadcn changelog `2026-07-base-ui-default`, x.com/shadcn/status/2073021571342520343.
- **Presets** encode base + visual style + theme + fonts and rewrite component code.
  Styles: Vega (classic), Nova (compact), Maia, Lyra, Mira. `components.json`
  `style` is `{base}-{style}`, e.g. `base-nova`. `shadcn apply` switches presets
  on an existing project (`--only theme,font`).
- **97 blocks**: `sidebar-01..16`, `dashboard-01`, `login-01..05`, `signup-01..05`,
  ~80 chart blocks. `sidebar-07` = "A sidebar that collapses to icons".
- **61 UI components.** New in Oct 2025: `spinner`, `kbd`, `button-group`,
  `input-group`, `item`, `empty`, `field`. Also present: `native-select`
  (first-ship date unverified), plus AI primitives (`message`, `bubble`, …).
- Migrations available: `icons`, `radix`, `rtl`. Themes: 5. Fonts: 52.

## What was applied

Scope chosen by the user: foundation + shell + primitives (not a full 55-file rewrite).

| Area | Change |
|---|---|
| Init | `shadcn init -b base -p vega`, `style: base-vega`, Tailwind v4, CSS variables |
| Components | 33 added, including all 8 of the 2025–26 additions |
| Token bridge | shadcn semantics declared as **aliases** of the existing palette |
| Shell | `sidebar-07` icon-collapsible sidebar, state persisted in `sidebar_state` cookie and read server-side |
| Primitives | `Modal`→Dialog, `EmptyState`→Empty, `Spinner`→Spinner, `Avatar`→Avatar |
| Palette | `CommandPalette`→`CommandDialog`/cmdk |
| Docs | dependency claim corrected in `README.md` and `CLAIMS.md` |

### Token bridge

The critical decision. `shadcn init` had overwritten `--border` with its own neutral
gray and set `--primary` to near-black, discarding the indigo brand. `globals.css`
now declares the Fourty palette first and shadcn's semantic names as aliases of it,
so `bg-primary` and `bg-background` resolve to Fourty's colours. Verified in-browser:
`--border: #263043`, `--primary: #6366f1` (dark), `#4f46e5` (light).

Two `accent` namespaces now coexist and do **not** collide: `--color-accent-*`
(indigo brand scale, `bg-accent-600`) and shadcn's `--accent` (hover surface,
`bg-accent`).

### Verified in a real browser

Icon-collapse (`data-state` expanded↔collapsed, `data-collapsible=icon`), cookie
persistence, collapsed tooltips, light and dark rendering, dialog accessible names
("Command palette", "Edit contact"), `role=combobox`, `role=option`, filtering.

## Defects found and fixed

1. **Account menu crashed the whole app.** `DropdownMenuLabel` maps to Base UI's
   `Menu.GroupLabel`, which throws unless it sits inside a `Menu.Group`. Adapting
   sidebar-07's `nav-user` dropped its `DropdownMenuGroup` wrapper, so clicking the
   footer avatar threw `MenuGroupContext is missing` and rendered the error
   boundary. Only e2e caught this — typecheck and build were both green.
2. **Sidebar had no navigation landmark.** shadcn's sidebar parts are all `div`s,
   so porting the shell silently dropped `<nav aria-label="Main">`. Caught by
   `tests/a11y.test.ts`; a `<nav>` is now declared explicitly in `app-sidebar.tsx`.
3. **Command input never received focus on open**, making ⌘K unusable. `autoFocus`
   added to `CommandInput`.
4. **`Modal` opened without focus, so Escape stopped dismissing it.** Base UI binds
   Escape to the focused popup, so the missing initial focus took the dismiss
   behaviour with it. The old hand-rolled Modal did this explicitly; restored with
   a ref + `requestAnimationFrame` focus on open. (`autoFocus` does not work here —
   the popup is a `div`.)
5. **`init` put `shadcn` and `tw-animate-css` in `dependencies`.** Moved to
   `devDependencies` — the CLI and a CSS package are not runtime deps.
6. **Palette e2e was flaky.** The ⌘K listener is attached during hydration, so a
   press on a cold server is dropped. The spec now retries the shortcut via
   `toPass` instead of racing a fixed wait.

## Verification

Local Postgres on **5432 belongs to another project**; Fourty's is the
`fourty-test-pg` container on **5433**. That mismatch — not any code change — is
why the suites appeared to fail. Pointing at 5433 makes everything green.

- `npx tsc --noEmit` — clean.
- `npm run build` — compiles, 80 routes.
- Unit tests: **574 passed, 2 skipped, 57/57 files.** Matches the count in
  `CLAIMS.md`.
- E2E: **17/17 passed.**
- Manually exercised in a browser against a seeded dev database: login, dashboard,
  contacts, settings, icon-collapse + cookie persistence across a full reload,
  ⌘K → filter → Enter → navigate, Escape dismissal, the account menu, and the
  New-contact modal.
- `npm run lint` is **broken independently of this work**: Next 16 removed
  `next lint` and `package.json` still calls it.

### Running the suites on this machine

```bash
TEST_DATABASE_URL="postgresql://fourty_app:fourty_app@localhost:5433/fourty_test" \
TEST_MIGRATE_DATABASE_URL="postgresql://fourty:fourty@localhost:5433/fourty_test" \
REVTEST_DATABASE_URL="postgresql://fourty:fourty@localhost:5433/fourty_revtest" \
npx vitest run tests/
```

A gitignored `.env` now points the app at `localhost:5433/fourty` (schema migrated
and seeded; `demo@fourty.dev` / `demo1234`).

## Deliberately not done

- `Field` was **not** rebuilt on shadcn's `Field`/`FieldLabel`: their `flex w-fit`
  label fights the full-width inputs these forms use. `@/components/ui/field` is
  available for new forms.
- The ~277 uses of `.btn-primary`/`.card`/`.input`/`.th`/`.td` across 55 files are
  untouched and still work through the token bridge.
- `icons.tsx` (214 lines of hand-drawn SVG) still serves un-migrated pages; the new
  shell uses `lucide-react`. Icon sets are mixed until those pages migrate.
- `charts.tsx` still uses raw recharts, not shadcn `ChartContainer`.

## Typography

Settled: **Inter**, self-hosted through `next/font/google`, replacing the system
stack that `globals.css` still declares as the fallback. The trade-off accepted is
that a build now needs network access to fetch the font; in exchange the UI reads
identically on macOS, Windows and Android instead of shifting between SF Pro,
Segoe UI and Roboto. Switching to Geist is a one-line change plus
`shadcn add @shadcn/font-geist`.

## Open questions

1. shadcn `chart` pins `recharts@3.8.0`; the project is on `^3.9.2`. npm kept 3.9.2
   and everything is green, but the pin is a latent conflict if `chart` is adopted.
2. shadcn's sidebar binds **⌘B** to toggle. New global shortcut — acceptable?
3. Should the mobile sidebar sheet (now reachable from the top-bar trigger)
   replace the bottom nav later, or stay as the secondary path it is now?
4. `vitest.config.ts` and `playwright.config.ts` default to port **5432**, which on
   this machine is another project's Postgres. Worth defaulting to 5433, or is the
   env-var override the intended workflow?
