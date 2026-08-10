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

Both webfonts (Inter for UI, Archivo for display) are fetched by `styles.css`.
Nothing else needs loading.

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

**Semantic colour is for record meaning only** — status, score band, priority.
Every one of those chips is a **10% wash behind saturated text**, never a solid
fill. `StatusChip`, `ScoreBadge` and `PriorityChip` already encode this; reach for
them rather than re-colouring a `Badge` — each was measured against its own
wash, which is a stricter ground than the surface and the reason a colour that
looks fine can still fail.

Other conventions worth honouring: radii derive from one 10px root
(`rounded-md` 8px controls, `rounded-xl` 14px cards, `rounded-4xl` pills);
separation is a 1px line, not a shadow; motion is 120–180ms and nothing bounces
(`animate-fade-up` is the entrance). `font-display` is Archivo and belongs to
brand and editorial surfaces — **never inside the product UI**, where weight and
tracking carry hierarchy instead.

## Where the truth lives

- `_ds/<folder>/styles.css` and its `@import` closure — the whole palette, every
  token, both type roles. Read it before inventing a colour.
- `components/<group>/<Name>/<Name>.d.ts` — the prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — how to compose that component.

## An idiomatic screen fragment

```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent,
         Button, StatusChip } from "fourty";

<div className="bg-bg p-4 md:p-8">
  <div className="mb-5 flex items-center justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink">Deals</h1>
      <p className="mt-0.5 text-sm text-ink-muted">38 deals · $1.24M total</p>
    </div>
    <Button>New deal</Button>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Acme Corp</CardTitle>
      <CardDescription>Renewal · closes 12 Mar</CardDescription>
    </CardHeader>
    <CardContent className="flex items-center gap-2">
      <StatusChip status="customer" />
      <span className="text-sm text-ink-muted">Owner · Dana Whitfield</span>
    </CardContent>
  </Card>
</div>
```

Library components carry the controls; the utility classes above are for your own
layout glue. Numbers in this product are always qualified — a win rate carries its
window, a forecast its method, a score its provenance. Never ship a bare number.
