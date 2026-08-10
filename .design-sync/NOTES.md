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

## The two flags without which the build cannot start

Both are easy to omit, and omitting either fails in a way that does not name the
real cause. Run them in this order, every time:

1. **Emit the declaration tree first.** `npx tsc -p .design-sync/tsconfig.dts.json`
   writes `.design-sync/.cache/types/`, which `package.json`'s `types` field
   points at. It is gitignored, so a fresh clone has none and the component
   surface comes up empty.
2. **Always pass `--entry .design-sync/ds-entry.ts`.** Without it the converter
   looks for `node_modules/fourty/package.json` — which never exists, because
   npm will not self-install a package into its own repo — and dies on a bare
   `ENOENT` from `lib/dts.mjs` that says nothing about the flag. With it, the
   converter walks up from the entry to the first `package.json` carrying a
   `name`, lands on the repo root, and reads `types` from there. That walk is
   the whole mechanism; no `node_modules/fourty` symlink is needed, and adding
   one would only create a recursive self-link.

`ds-entry.ts` itself is committed and hand-maintained — it names the export
surface, since an application has no barrel of its own. Add a component to
`src/components/ui/` and it does not sync until it is exported there.

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
supply two things the app supplies at runtime: the webfont (the app binds Inter
via `next/font/google` on `<html>`; there is no next/font outside the app) and
an explicit `@source "../src"`, since Tailwind's automatic content detection is
relative to the entry file's directory and would otherwise miss `src/`. It holds no design decisions — the palette comes from `globals.css`.

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

## Two card families the converter does not manage

`guidelines/` and `screens/` are written AFTER the converter, by
`npm run build:ds-foundations` and `npm run build:ds-screens`. Run both on every
sync — the converter rewrites `guidelines/` from `guidelinesGlob` (markdown
only; it skips HTML by design) and knows nothing about `screens/`.

They fail differently, which is why only one of them has a test that can catch a
wrong VALUE:

- **guidelines** paint from `var(--token)`, so they cannot show a stale colour.
  A renamed token leaves a blank swatch instead.
- **screens** CALL component APIs. When a component changes shape a screen
  renders wrong or throws, and nothing else in the repo notices.

`tests/ds-cards.test.ts` renders every card in both families headlessly. It
skips when `ds-bundle/` is absent, so a fresh clone still passes — it is a drift
guard for whoever builds, not a gate on the app's test run.

**Nothing in the pipeline reminds you to run these two.** The driver's verdict,
its `upload.deletePaths`, and the `_ds_sync.json` anchor all describe components
only — a sync that skips the two builds gets a clean verdict, a clean
reconciliation, and leaves last sync's cards sitting on the project. The
2026-08-10 run did exactly that and only caught it by diffing `list_files`
against the local tree by hand. Do that diff before calling a sync done: the
only paths that may exist remotely and not locally are `_ds_manifest.json` and
`_adherence.oxlintrc.json`, which the app's self-check writes.

`screens/**` is also absent from the upload plan's `writes` globs in the
skill — a second `finalize_plan` is needed to ship it.

## Re-sync risks

- **`cssEntry` is a build artifact, not a source file.** If the stylesheet is
  stale, every preview renders with an old palette and nothing in the pipeline
  flags it. Recompile first, always.
- **`sourceKeys` track a component's own file, not what it imports.** The
  2026-08-10 artwork change edited `src/lib/brand-artwork.ts`; `logo.tsx` never
  moved, so the driver reported `Logo` as unchanged and carried its grade
  forward without recapturing — even though its render was the entire point of
  the sync. The bundle still ships correctly (it is rebuilt whole), so this is a
  verification blind spot, not a content one. When a change lands in a module a
  component reads rather than in the component, confirm that component by eye:
  `ds-bundle/_screenshots/<group>__<Name>.png`, or force it with
  `package-capture.mjs --components <Name>`.
- **The webfont loads remotely** (`fonts.googleapis.com`) rather than shipping
  as a file, so validate reports `[FONT_REMOTE]`, not `[FONT_MISSING]`. If the
  brand ever needs a self-hosted font, that becomes a `cfg.extraFonts` job.
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
- **One typeface, on the brand owner's confirmation.** The lockup's typeface is
  unrelated to the product's, so `--font-display` resolves to Inter rather than
  carrying a second family. The role name is kept so a real display face is a
  one-line change.
- **The safelist grew a feedback family (2026-08-10).** `--feedback-{ok,warn,error}`
  and their washes joined the record semantics, plus `bg-{ink,ink-muted}/{50,60,70}`
  for the timeline dot ladder. `conventions.md` now tells the design agent to use
  them, so they had to go into `ds-css-entry.css` in the same change — a class the
  header offers but the safelist omits renders as nothing. Verify after any palette
  edit by compiling the entry and grepping the output for the utility, not by
  assuming: `npx @tailwindcss/cli -i .design-sync/ds-css-entry.css -o /tmp/x.css`
  then `grep -o '\.text-feedback-warn{[^}]*}' /tmp/x.css`.
- **A `@apply`-only token emits no utility class.** When a token is reached only
  through `@apply` in a component class, Tailwind inlines the declaration and the
  `.bg-<token>` utility never appears in the output. Grepping for the class name
  says "missing" when it is working correctly; grep the consuming rule instead.
- **`globals.css` no longer defines `.card`, `.input` or `.btn-*` (2026-08-10).**
  Every one of those 174 call sites moved to `<Card>`, `<Input>`, `<NativeSelect>`,
  `<Textarea>` and `<Button>`, so the exported bundle and the shipped product now
  describe the same objects. A design agent reading `conventions.md` and composing
  from the library is composing what the app actually renders.
- The four Next-dependent components are deliberately out of scope. If a future
  sync wants them, they need shims for `next/navigation` and `next/link`, not a
  config tweak.
