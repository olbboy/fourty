# Brand & design guidelines

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../public/brand/logo-full-inverse.svg">
  <img src="../public/brand/logo-full.svg" alt="Fourty" width="220">
</picture>

The Fourty logo, the colour tokens behind it, and the rules for using both. If you
are adding a header, a README badge, a slide, or a screenshot to this project, this
page is the source of truth.

Everything here is measured from [`brand/logo-master.svg`](../brand/logo-master.svg)
and the tokens in [`src/app/globals.css`](../src/app/globals.css) — not from a style
guide invented alongside them.

---

## The mark

The logo is supplied artwork, not a lettering exercise: the **4OURTY** lockup, whose
O is a solid orange ring. It ships in two lockups, and which one you use is decided
by the space, not by preference.

| Lockup | What it is | Where it belongs |
|---|---|---|
| **full** | the whole 4OURTY lockup | anything with width — headers, README, slides |
| **compact** | the 40 monogram | square and narrow surfaces — the icon rail, favicons, avatars |

**There is no lettered substitute.** Never set "Fourty" in a font where the lockup
belongs, and never rebuild the lockup by putting the monogram next to live type —
the spacing between the 4, the O and URTY is part of the drawing.

## Assets

One drawing, several outputs. [`brand/logo-master.svg`](../brand/logo-master.svg) is
the only hand-maintained file; `npm run build:brand` derives the rest from it, which
is what stops the favicon from drifting away from the sidebar.

| File | Generated? | Use it for |
|---|---|---|
| [`brand/logo-master.svg`](../brand/logo-master.svg) | source | Editing. The `#compact` and `#lettering` groups are what make the two lockups separable. |
| [`src/lib/brand-artwork.ts`](../src/lib/brand-artwork.ts) | ✅ | Geometry for `<Logo>`, so React renders the artwork inline. |
| [`public/icon.svg`](../public/icon.svg) | ✅ | Favicon and PWA icon — the monogram centred in a square, no tile behind it. |
| `public/brand/logo-{full,compact}.svg` | ✅ | The lockups as files, for docs and press. |
| `public/brand/logo-{full,compact}-inverse.svg` | ✅ | The same, for dark grounds. |

### In the app

```tsx
import { Logo } from "@/components/logo";

<Logo variant="full" height={24} title="Fourty" />
<Logo variant="compact" height={20} title="Fourty" />
```

**Tone follows the ground, and `<Logo>` handles it.** The letterforms are ink and
vanish on a dark surface while the orange stays, which reads as a broken image. The
default (`tone="auto"`) draws both ink layers and lets CSS keep one, so the lockup is
correct in the first painted frame — no theme flash and no JavaScript. Pass an
explicit `tone` only where the ground does not follow the theme.

Pass `title` where the surrounding control is not already labelled; without it the
lockup is `aria-hidden` and names nothing.

### In Markdown

Use `<picture>` so the lockup follows the reader's GitHub theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./public/brand/logo-full-inverse.svg">
  <img src="./public/brand/logo-full.svg" alt="Fourty" width="260">
</picture>
```

## Clear space and minimum size

**Clear space** on all four sides is the height of the O. Nothing — text, badge,
border, screenshot edge — comes inside it.

**Minimum heights**, enforced by `<Logo>` itself (it clamps up rather than render
something illegible):

| Lockup | Floor | Why |
|---|---|---|
| compact | 16px | Verified as a favicon at 16px; both counters stay open. |
| full | 20px | The wordmark is the limit, not the monogram. Below 20px, drop to `compact`. |

## Colour

Two colours, both read off the artwork rather than chosen next to it.

| | Value | Where |
|---|---|---|
| Orange | `#fb631a` | The O, in both tones. It never flips. |
| Ink | `#231f20` | The letterforms on a light ground. |
| Ink (inverse) | `#fbfaf8` | The letterforms on a dark ground. |

The orange is also `--color-accent-500`, which is `--primary`: the brand's one
accent and the logo's O are the same colour by construction, not by coincidence.

> [!WARNING]
> **Never place either lockup on the brand orange.** The O *is* that orange and
> disappears into it — the lockup reads as "4 URTY". Ink, white or a neutral ground
> only. This is why `<Logo>` takes no background of its own.

A filled accent control carries **ink, not white**: on this orange white reaches only
3.04:1 while the artwork's ink reaches 5.36. Anything drawn in the accent that is not
a fill — link text, an accent icon — uses `--color-accent-700` (5.22:1 on white).

## Typography

| Role | Face |
|---|---|
| Product UI | **Inter**, loaded via `next/font` in [`layout.tsx`](../src/app/layout.tsx), bound to `--font-sans` |
| Display | `--font-display`, the brand and editorial role — currently **Inter**, the same family |

The lockup itself is drawn geometry and loads no font.

> [!NOTE]
> There is deliberately **one typeface**. The lockup is drawn artwork and its own
> typeface has nothing to do with the product's, so a second family would be
> echoing nothing. `--font-display` stays as a role name: point it at a real
> display face here if the brand ever gets one, and nothing downstream changes.

## Don't

- Recolour the lockup, or apply a gradient to it.
- Place it on the brand orange, or on a busy photo.
- Re-space it, or rebuild it from the monogram plus live text.
- Stretch, squash, rotate, or outline it. Scale proportionally only.
- Add a drop shadow, glow, or bevel.
- Re-typeset "Fourty" in another face and call it the wordmark.

## Licensing

The lockup is supplied artwork owned by the project. It is not derived from a
licensed typeface, and nothing loads a font at runtime to render it.

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
> **Editing the logo.** Edit [`brand/logo-master.svg`](../brand/logo-master.svg) and
> run `npm run build:brand` — the component geometry, the exported lockups and the
> app icon are all regenerated from it. Re-check the result at 16px before
> committing: that size, not the hero size, is what the drawing has to survive.
