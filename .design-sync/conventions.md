# Building with Fourty

Fourty is a CRM: a flat, hairline, information-dense admin UI. White ground, warm
stone neutrals, **one** orange accent, 14px body text, almost no shadow. It should
look like a tool you operate, not a product you are sold.

## Setup

**No provider is required for styling.** Every token is declared on `:root` in
`styles.css`, so a component is correctly styled the moment that stylesheet is
loaded. `ThemeProvider` exists only so several controls can share a dark-mode
toggle — dark mode itself is the `dark` class on `<html>`, and adding that class
re-declares the palette with no React involvement.

Inter is fetched by `styles.css`. There is one typeface — the lockup is drawn
artwork, not type, so nothing needs a second family.

## The styling idiom: utility classes over two token layers

Style with Tailwind utility classes. The palette has **two layers and the second
never holds a raw value**: layer 1 is Fourty's own names, layer 2 is the shadcn
semantic vocabulary declared purely as aliases of layer 1. Use either — they
resolve to the same colours.

| Purpose | Layer 1 (Fourty) | Layer 2 (shadcn semantic) |
|---|---|---|
| Page ground | `bg-bg` | `bg-background` |
| Panel / card | `bg-surface` | `bg-card`, `bg-popover` |
| Inset row, track, hover | `bg-surface-2` | `bg-muted`, `bg-secondary`, `bg-accent` |
| Hairline | `border-line` | `border-border`, `border-input` |
| Body text | `text-ink` | `text-foreground` |
| Secondary text | `text-ink-muted` | `text-muted-foreground` |
| Focus halo | — | `ring-ring`, `ring-ring/50` |

**The accent is a ramp, and which step you use is a rule, not a preference:**

- **Fills** — `bg-primary` (= `bg-accent-500`, the brand orange) with
  `text-primary-foreground` on top. That foreground is the artwork's own ink,
  **not white**: on this orange, white reaches only 3.04:1 and the ink reaches
  5.36:1 — and ink-on-orange is the pairing the logo already makes.
- **Accent-coloured text** — `text-accent-700` (5.22:1 on white, and
  `dark:text-accent-400` on dark). Never `text-primary` for text: the flat
  orange clears only 3.04:1 there.
- **Hover on a fill** — `bg-accent-600`. **Washes** — `bg-accent-50`, or an
  opacity step like `bg-accent-600/10`.
- **Focus is a warm neutral (`ring-ring`), never the accent** — focus is a shape
  cue and the orange stays reserved for the primary action.

Keep the accent under ~5% of any screen: on a typical view it is the primary
button and the active pill, nothing else.

**Semantic colour comes in two families, and neither is a place to improvise.**
Record meaning — status, score band, priority — and feedback —
`feedback-{ok,warn,error}`, for the outcome of something that just happened.
Every one of those is a **10% wash behind saturated text**, never a solid fill,
and each was measured against its own wash, which is a stricter ground than the
surface and the reason a colour that looks fine can still fail. `StatusChip`,
`ScoreBadge` and `PriorityChip` already encode the record family; reach for them
rather than re-colouring a `Badge`. For feedback, use
`bg-feedback-warn-wash text-feedback-warn` and its two siblings.

**Icons are one library.** Lucide, always. `components/icons.tsx` names the app's
own vocabulary over it (`IconTrash`, `IconPlus`, …) and adds two things Lucide does
not: `aria-hidden` by default, because an icon here is decorative and the control
around it carries the name, and numeric `width` / `height`. Chrome built on a shadcn
block imports Lucide directly. Either way there is one stroke voice — never a second
icon set.

**Destructive confirmations use `useConfirm()`, never `window.confirm`.** The native
dialog is the one surface no token reaches. `const [askConfirm, confirmDialog] =
useConfirm()` returns a promise and the dialog to mount; the confirming button names
the action ("Delete", "Revoke", "Disconnect"), never "OK".

**Never reach for a raw palette utility** — `text-amber-600`, `bg-red-500/10`,
`bg-violet-400`. Nothing measures them, and they do not flip with the theme, so a
call site ends up carrying a `dark:` variant that is itself unmeasured. Every
token above flips on its own. `destructive` is a fill and border colour; red
*text* is `text-feedback-error`.

Other conventions worth honouring: radii derive from one 10px root
(`rounded-md` 8px controls, `rounded-xl` 14px cards, `rounded-4xl` pills);
separation is a 1px line, not a shadow; motion is 120–180ms and nothing bounces
(`animate-fade-up` is the entrance). `font-display` names the brand and
editorial role; it currently resolves to Inter, so hierarchy inside the product
is carried by weight and tracking, never by a second face.

## Where the truth lives

- `_ds/<folder>/styles.css` and its `@import` closure — the whole palette, every
  token, both type roles. Read it before inventing a colour.
- `components/<group>/<Name>/<Name>.d.ts` — the prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — how to compose that component.

## An idiomatic screen fragment

A panel here is usually a heading and a body, padded once — so `Card` takes
`size="flush"` and owns no spacing of its own. `size="default"` and `"sm"` bring the
`CardHeader` / `CardContent` rhythm for anything that wants it. `render` makes the card
another element where the shape calls for it (`render={<form onSubmit={…} />}`).

```jsx
import { Card, Button, StatusChip } from "fourty";

<div className="bg-bg p-4 md:p-8">
  <div className="mb-5 flex items-center justify-between gap-3">
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Deals</h1>
      <p className="mt-0.5 text-sm text-ink-muted">38 deals · $1.24M total</p>
    </div>
    <Button>New deal</Button>
  </div>

  <Card size="flush" className="p-4">
    <h2 className="text-sm font-semibold text-ink">Northwind Cloud</h2>
    <p className="mt-0.5 text-sm text-ink-muted">Renewal · closes 12 Mar</p>
    <div className="mt-3 flex items-center gap-2">
      <StatusChip status="customer" />
      <span className="text-sm text-ink-muted">Owner · Dana Whitfield</span>
    </div>
  </Card>
</div>
```

Library components carry the controls; the utility classes above are for your own
layout glue. Numbers in this product are always qualified — a win rate carries its
window, a forecast its method, a score its provenance. Never ship a bare number.
