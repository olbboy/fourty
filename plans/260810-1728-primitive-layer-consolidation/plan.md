# Primitive-layer consolidation

**Status** complete — four phases plus follow-ups, 2026-08-10
**Origin** [Hallmark audit](../reports/hallmark-design-audit-260810-1709-design-system-vs-58-gates-report.md), critical finding 1
**Decision taken** consolidate onto the shadcn/Base UI components; the CSS classes retire

## Why

Two implementations of the same three primitives shipped side by side. `.card` had 47
call sites and `<Card>` none, so `ds-bundle/` and `.design-sync/conventions.md`
documented a library the product did not render. Any fix applied to one implementation
missed the other, which is how a 2px height divergence survived unnoticed.

## Phase 1 — converge ✅

- `.input` and the three `.btn-*` classes → `h-9`, border-box, so a bordered control
  is no longer 2px taller than its unbordered sibling.
- `<Card>` dropped `shadow-xs` and `ring-1` for `border border-line`.
- Focus rings taken out of the transition set on both layers.

## Phase 2 — Button ✅ (66 sites)

All 66 moved. `.btn-primary` → `<Button>`, `.btn-ghost` → `variant="outline"`, and the
icon-only row actions → `size="icon-sm"` / `icon-xs`, keeping whichever of `outline`
or `ghost` matches the border each site already drew. The seven `<a>` / `<Link>` sites
use `render={<a />}` / `render={<Link />}`.

**`.btn-danger` had zero call sites.** It was dead CSS, so it was deleted rather than
ported — along with the `--danger-fill` tokens added for it in Phase 1 and the
`destructive-solid` variant added to carry them. `<Button variant="destructive">` (a
wash, stock shadcn) remains for when the `confirm()` dialogs get rebuilt; a solid
danger fill can be added then, with its pair measured, if that flow wants one.

`variant="outline"` also dropped `shadow-xs`, for the same reason `<Card>` did.

## Phase 3 — Input and Select ✅ (84 sites)

More than the 61 the plan estimated: 53 `<input>`, 27 `<select>`, and **4 `<textarea>`**
the original count missed because their `className` sat on its own line.

Those four textareas are why this phase mattered more than it looked. Phase 1 gave
`.input` a fixed `h-9`, which silently forced every `<textarea rows={2}>` to 36px —
a regression introduced by the fix and shipped for the length of one commit. `<Textarea>`
has no fixed height, so the migration removed it.

Selects went to `<NativeSelect>`, not `<Select>` — these sit in uncontrolled `<form>`
elements read by `FormData`, and Base UI's `Select` posts no value. `NativeSelect` puts
its className on a `w-fit` wrapper, so the 16 previously-full-width selects needed an
explicit `w-full`.

## Phase 4 — Card ✅ (47 sites)

Two additions to `<Card>` made a faithful conversion possible:

- **`size="flush"`** — a card that owns no spacing. Stock `<Card>` brings
  `py-(--card-spacing)` and a `gap` between children; this product's panels are a
  heading and a list, padded once by the caller. Without `flush` every one of the 47
  would have had its internal spacing rewritten.
- **`render`** — same prop and behaviour as `Button`'s. A card is a `<form>` on the
  login page and a `<label>` on the CSV dropzone. `<Card>` being a `<div>` and nothing
  else is part of why the app never adopted it.

`e2e/settings.spec.ts`'s seven `.card` locators moved to `[data-slot=card]` in the same
change. `.card`, `.input` and the `.btn-*` rules are gone from `globals.css`.

## Verification

`tsc` clean · 657 unit tests · 17 e2e · `npm run build` · `build:ds-screens` + the
`ds-cards` render guard · six full-page screenshots at 1280×900 read by eye
(dashboard, contacts, deals, settings, reports, workflows).

The screenshots earned their place: they caught a `⚠️` emoji heading on the dashboard
that the first emoji sweep missed, because that sweep used a hand-written glyph list
instead of the Unicode pictograph ranges.

## Follow-ups, closed the same day

- **`CardTitle` took a `render` prop.** It rendered a `<div>`, so a panel built from the
  stock component announced as an unnamed group. `<CardTitle render={<h2 />}>` now puts
  the heading in the accessibility tree.
- **One icon library.** `icons.tsx` is a thin adapter over Lucide rather than 214 lines
  of hand-drawn SVG. The two sets were never two stroke voices — the custom set was
  drawn to Lucide's own spec (24 grid, 2px stroke, round caps), and `ui/*` already
  shipped Lucide, so this was one voice maintained twice. The adapter keeps the naming,
  the numeric `width`/`height` API, and the `aria-hidden` default that Lucide lacks, so
  none of the ~120 call sites moved.
- **The nine `confirm()` dialogs are gone.** `useConfirm()` returns a promise and the
  dialog to mount, so each call site changed by one `await`. The confirming button names
  the action — "Delete", "Revoke", "Disconnect" — never "OK".

  Two things came out of that. The hook has to sit at the top of the component: three
  detail pages have early returns above their handler, and inserting it beside the
  handler tripped the rules of hooks and blanked the page — caught by e2e, not by
  `tsc`. And `e2e/settings.spec.ts` could no longer accept a browser dialog, so its
  helper now drives the real one, which is what proves the replacement is wired rather
  than merely present.
- **`Button variant="destructive"` was measured and rebuilt.** Stock shadcn deepens its
  wash on hover, which lifts the ground past what any red text clears — 3.93:1 in light,
  3.82:1 in dark, and 4.01:1 even at rest with `text-destructive`. It now uses the
  measured `--feedback-error` pair at a fixed 10% wash and moves its **border** on hover,
  so it is covered by the same test as every other chip.

## What is still not consolidated

- `CardHeader` / `CardContent` have no call sites. Compositional helpers, not a second
  implementation.
- `.chip`, `.chip-btn`, `.th`, `.td` remain CSS classes with no component counterpart.
  Out of scope for this decision.
- **Undo, not confirmation.** Several of these guards protect reversible actions and
  would be better as an optimistic write plus an Undo. That needs restore endpoints the
  API does not have; the dialog replaces the mechanism, not the interaction.

## Rollback

This shipped as a single commit alongside the audit fixes, so reverting it takes the
whole design pass with it. The three class rules and their call sites move together by
construction — a partial revert would restore `.card` without its 47 users, or the
users without the rule.
