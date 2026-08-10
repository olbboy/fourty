# design-sync notes — fourty

Repo-specific gotchas for future syncs. Read this before re-running anything.

## Source shape

- This repo is a **Next.js application**, not a published component library:
  `package.json` is `private: true` with no `main`/`module`/`exports` and no
  build that emits a `dist/`. The converter therefore runs in **synth-entry
  mode** off `src/`, and `.d.ts` prop contracts are weaker than a real build
  would give. `cfg.tsconfig` is set so esbuild resolves the `@/…` path aliases.
- Component scope is `src/components/`. Four app-level components import
  `next/navigation` / `next/link` and cannot bundle for browser previews —
  `shell.tsx`, `app-sidebar.tsx`, `command-palette.tsx`, `agent-panel/index.tsx`.
  `src/components/ui/*` is clean of Next imports and is the reliable core.

## Stylesheet: must be pre-compiled

`src/app/globals.css` is a Tailwind v4 **source** file (`@import "tailwindcss"`),
not usable CSS. Preview cards and rendered designs get static CSS and no build
step, so the sync compiles it first:

```sh
npx @tailwindcss/cli -i .design-sync/ds-css-entry.css -o .design-sync/.cache/tailwind-compiled.css
```

`cfg.cssEntry` points at that output. **Re-run this before every build** — the
output lives under the gitignored `.cache/`, so a fresh clone has no stylesheet
until it is regenerated, and a palette change in `globals.css` is invisible to
the bundle until it is recompiled.

`.design-sync/ds-css-entry.css` (committed) exists because a static export has to
supply two things the app supplies at runtime: the webfonts (the app binds Inter
and Archivo via `next/font/google` on `<html>`; there is no next/font outside the
app) and an explicit `@source "../src"`, since Tailwind's automatic content
detection is relative to the entry file's directory and would otherwise miss
`src/`. It holds no design decisions — the palette comes from `globals.css`.

## Environment

- **A `scout-block` hook blocks any Bash command whose text contains
  `node_modules`**, and `package-build.mjs` requires `--node-modules <path>`.
  The 2026-08-10 run added a temporary `!node_modules` allow-line to
  `~/.claude/.ckignore` and **reverted it after the sync**. A future run needs
  the same allowance for the duration of the build — ask before changing that
  file, and put it back afterwards.
- Test suite needs a real Postgres. A throwaway one that satisfies every test
  (owner role `fourty`, RLS role `fourty_app`, both test databases):

  ```sh
  docker run -d --name fourty-test-pg -p 5432:5432 \
    -e POSTGRES_USER=fourty -e POSTGRES_PASSWORD=fourty -e POSTGRES_DB=fourty \
    -e FOURTY_APP_PASSWORD=fourty_app \
    -v "$PWD/docker/init-fourty-app.sh:/docker-entrypoint-initdb.d/10-fourty-app.sh:ro" \
    postgres:16
  docker exec fourty-test-pg psql -U fourty -d postgres \
    -c "CREATE DATABASE fourty_test OWNER fourty;" \
    -c "CREATE DATABASE fourty_revtest OWNER fourty;"
  ```

  Without it 40 files fail on `password authentication failed for user "fourty"`
  — an environment failure, not a regression.

## The stylesheet is a vocabulary contract

Tailwind emits only the utilities it finds in the scanned source, so a class the
app happens not to use today would **silently not exist** in the shipped
stylesheet — and a design built with this system would render it as nothing.
`ds-css-entry.css` therefore carries `@source inline(...)` safelists for the
design language's own vocabulary (both token layers, the accent ramp, the two
type roles). **`conventions.md` and that safelist must stay in step**: every
class the header tells the design agent it may use has to be in the safelist, and
`font-display`, `ring-ring` and `bg-bg` are in there for exactly that reason —
they were missing on the first compile.

## Known render warns

Triaged as legitimate; a warn NOT in this list is new and should be looked at.

- `[RENDER_THIN]` on **Modal**, **Dialog**, **Sheet** — these render into a
  portal with fixed positioning, so the measured root height is 0px. Confirmed
  visually from the review sheets: all three render completely and correctly.
- `[FONT_REMOTE]` "Inter" — expected; the webfonts load from a font host rather
  than shipping as files (see the stylesheet section above).

## Preview-authoring gotchas found the hard way

- **`DropdownMenuLabel` must sit inside `DropdownMenuGroup`.** Base UI reads
  `MenuGroupContext` from it; a label placed directly under `DropdownMenuContent`
  throws `MenuGroupContext is missing` and the whole card renders empty.
- **Overlay components need `cfg.overrides.<Name>.cardMode = "single"`** plus a
  viewport, or they escape their grid cell. Applied to Dialog, Sheet, Modal,
  Popover, Tooltip, Select and DropdownMenu.
- **`RecordFact.score` is a 0–1 fraction, not 0–100.** The component renders
  `Math.round(score * 100)%`, so `score: 78` printed "7800%".
- **Base UI `SelectValue` renders the selected VALUE**, not the item's text, so a
  lowercase slug shows up verbatim in the trigger. Give items values that read as
  labels.

## Re-sync risks

- **`cssEntry` is a build artifact, not a source file.** If the stylesheet is
  stale, every preview renders with an old palette and nothing in the pipeline
  flags it. Recompile first, always.
- **The webfonts load remotely** (`fonts.googleapis.com`) rather than shipping
  as files, so validate reports `[FONT_REMOTE]`, not `[FONT_MISSING]`. If the
  brand ever needs self-hosted fonts, that becomes a `cfg.extraFonts` job.
- **The accent is read off the artwork, not chosen.** `--color-accent-500` is
  the orange in `brand/logo-master.svg` (`#fb631a`). The first sync had been
  built on a traced approximation (`#f86008`); the 2026-08-10 re-sync shipped
  the real value (`styleSha` fbd1022e → 06486933). Re-run the stylesheet compile
  and re-upload after any change to the master — a palette that disagrees with
  the logo beside it is the one mismatch nobody spots and everybody feels.
- **A palette-only change is cheap.** That re-sync moved the stylesheet and the
  bundle but touched no preview, so the anchor carried all 193 existing
  components forward and only the newly added `Logo` needed grading. Scope the
  upload by the driver's `upload` partition, not by re-uploading everything.
- **Archivo is a substitution.** The lockup's real typeface was never supplied;
  Archivo at `wdth` 125% is a considered match, not the original. Naming the
  real face changes one line in the `@theme` block. (The artwork itself is no
  longer a substitution — the vector master is committed.)
- The four Next-dependent components are deliberately out of scope. If a future
  sync wants them, they need shims for `next/navigation` and `next/link`, not a
  config tweak.
