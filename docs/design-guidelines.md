# Brand & design guidelines

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../public/logo-dark.svg">
  <img src="../public/logo.svg" alt="Fourty" width="220">
</picture>

The Fourty logo, the colour tokens behind it, and the rules for using both. If you
are adding a header, a README badge, a slide, or a screenshot to this project, this
page is the source of truth.

Everything here is measured from the files in [`public/`](../public/) and the tokens
in [`src/app/globals.css`](../src/app/globals.css) — not from a style guide invented
alongside them. Change a value in either place and update this page with it.

---

## The mark

The logo is a **"40" monogram**. The `4` is Inter Display ExtraBold, outlined; the
`0` is a **true circle**, not the font's oval, set so it just touches the 4's
crossbar. The circle overshoots the cap band top and bottom the way a drawn round
glyph does, so it reads the same optical size as the 4 rather than slightly smaller.

That one substitution is the whole idea: it keeps the letterform anatomy correct
while giving the mark a geometric silhouette that survives down to a 16px favicon.

**Geometry**, on the mark's 64-unit artboard (cap band `y 10 → 54`):

| | |
|---|---|
| Circle centre | `cx 59.57`, `cy 32` |
| Circle outer radius | `22.71` (overshoots the cap band by 0.71 each way) |
| Circle counter radius | `11.71` — a ring 11 units thick |
| 4's stem | `x 23.54 → 33.52`, 9.98 units wide |
| Touch point | the circle tucks 2 units into the 4's crossbar |

## Assets

| File | Artboard | Ratio | Use it for |
|---|---|---|---|
| [`public/icon.svg`](../public/icon.svg) | `64 × 64`, `rx 14` | 1 : 1 | Favicon and PWA icon. Wired up in [`layout.tsx`](../src/app/layout.tsx) and [`manifest.ts`](../src/app/manifest.ts). |
| [`public/logo.svg`](../public/logo.svg) | `272.33 × 57.05` | 4.77 : 1 | Full lockup on light backgrounds. |
| [`public/logo-dark.svg`](../public/logo-dark.svg) | `272.33 × 57.05` | 4.77 : 1 | Full lockup on dark backgrounds. |
| [`public/logo-mark.svg`](../public/logo-mark.svg) | `80.48 × 64` | 1.26 : 1 | The mark alone, no wordmark. |
| [`src/components/logo-mark.tsx`](../src/components/logo-mark.tsx) | — | 1.26 : 1 | The mark inside the app. Takes the surrounding text colour via `currentColor`. |

Every file is a hand-authored SVG under 2 KB with no runtime font dependency. **The
SVGs are the source of truth** — there is no design file to sync, and no build step
that regenerates them.

### In Markdown

Use `<picture>` so the lockup follows the reader's GitHub theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./public/logo-dark.svg">
  <img src="./public/logo.svg" alt="Fourty" width="260">
</picture>
```

### In the app

```tsx
import { LogoMark } from "@/components/logo-mark";

<div className="flex size-8 items-center justify-center rounded-lg bg-accent-600 text-white">
  <LogoMark className="w-6" />
</div>
```

`LogoMark` is `aria-hidden`. Give it a visible text label or a `tooltip` alongside —
never rely on the mark alone to name the product to a screen reader.

## Clear space and minimum size

**Clear space** on all four sides is the width of the 4's stem: 10 units on the
64-unit artboard, or about **16% of the rendered height**. At a 64px logo that is
10px. Nothing — text, badge, border, screenshot edge — comes inside it.

**Minimum sizes**, each found by rendering the real file down a size ramp rather
than estimated:

| Asset | Floor | Why |
|---|---|---|
| `icon.svg` | 16px | Verified as a browser favicon. Below 16px the digits start merging into the tile, though the tile silhouette still reads. |
| `logo-mark.svg` | 16px height | The mark is the robust part — both counters stay open well below this on a HiDPI screen. 20px+ is still the comfortable choice for UI chrome. |
| `logo.svg` / `logo-dark.svg` | 20px height | **The wordmark is the limit, not the mark.** At 20px lockup height "Fourty" has a ~15px cap height; below that it muddies on a 1× display. Under 20px, drop the wordmark and use `logo-mark.svg` alone. |

## Colour

The brand scale lives in `globals.css` as `--color-accent-50` through `-900`. The
logo uses three of those steps and nothing else.

| Context | Mark | Wordmark | Background | Contrast |
|---|---|---|---|---|
| Light | `#4f46e5` (accent-600) | `#0f172a` | `#f8fafc` | 6.01:1 / 17.06:1 |
| Dark | `#818cf8` (accent-400) | `#f1f5f9` | `#0b0f1a` | 6.41:1 / 17.47:1 |
| Tile | `#ffffff` | — | `#4f46e5` | 6.29:1 |

> [!WARNING]
> **Do not put the light-mode indigo on a dark background.** `#4f46e5` on `#0b0f1a`
> measures **3.04:1** — under the 4.5:1 floor. That single number is the reason
> `logo-dark.svg` exists as a separate file; the dark lockup lifts the mark to
> accent-400 to clear it at 6.41:1.

The dark wordmark is `#f1f5f9`, deliberately a step brighter than the app's dark
body-text token (`--text: #e5e9f0`). A logo carries less mass than a paragraph and
needs the extra lift; this is the one place the brand colours diverge from the UI
tokens on purpose.

## Typography

| Role | Face |
|---|---|
| Product UI | **Inter**, loaded via `next/font` in [`layout.tsx`](../src/app/layout.tsx) and bound to `--font-sans` |
| Wordmark | **Inter Display SemiBold**, tracking −0.6, outlined to paths |

The wordmark is outlined, so it renders identically everywhere and needs no font
loaded. If you ever re-set it, use Inter **Display** — the optical size built for
large text — not the regular Inter cut, and keep the SemiBold weight. The wordmark
sitting lighter than the ExtraBold mark is what stops the lockup reading as one
undifferentiated block.

## Don't

- Recolour the mark outside the table above, or apply a gradient to it.
- Re-space the lockup, or rebuild it by putting `logo-mark.svg` next to live text.
  Use `logo.svg`; the gap is part of the drawing.
- Stretch, squash, rotate, or outline it. Scale proportionally only.
- Add a drop shadow, glow, or bevel.
- Re-typeset "Fourty" in another face and call it the wordmark.
- Place the lockup on a busy photo. Use the tile, or a solid panel.

## Licensing

The `4` and the wordmark are outlines derived from [Inter](https://rsms.me/inter/),
licensed under the SIL Open Font License. Only the outlines ship — no font binary is
redistributed and nothing loads a font at runtime, so the assets carry no runtime
attribution requirement.

## Trademark

**The code is MIT. The name "Fourty" and the "40" mark are not.**

[`LICENSE`](../LICENSE) grants you the source, in full, with no open-core carve-outs
— fork it, run it, modify it, sell it. It does not grant the project's identity. The
name and the logo are reserved so that "Fourty" keeps meaning *this* project, and so
nobody can pass an unrelated build off as an official one.

**Fine, no permission needed:**

- Running, forking, modifying, self-hosting, or selling the software.
- Saying truthfully what your thing is: *"built on Fourty"*, *"a fork of Fourty"*,
  *"compatible with Fourty"*, *"we migrated from Fourty"*.
- Naming the project in articles, comparisons, talks, docs, and course material.
- Reproducing the logo unmodified to refer to this project — a comparison table, a
  slide, an "integrates with" grid, a stack diagram.

**Ask first:**

- Using "Fourty" or the mark as the name or branding **of your own** product,
  service, company, domain, or app-store listing.
- Anything that implies official status, endorsement, sponsorship, or affiliation.
- Modified, recoloured, or redrawn versions of the logo — see [Don't](#dont).
- Merchandise.

> [!IMPORTANT]
> **If you distribute a modified version, rename it and replace the logo.** That is
> the one rule that matters. Users need to be able to tell your build from ours,
> especially when they come looking for support or a security advisory.

This is a plain-language summary of intent, not legal advice, and it does not
restrict anything the MIT licence grants over the code. Questions, or a use that
falls between the lists above: open an issue and ask.

---

> [!NOTE]
> **Editing the logo.** The SVGs are small and explicit — the `4` is one path, the
> `0` is a two-arc ring, and the geometry table above gives every number needed to
> redraw the circle. Edit the files directly. If you change the mark, re-check it at
> 16px before committing: that size, not the hero size, is what the drawing is tuned
> for.
