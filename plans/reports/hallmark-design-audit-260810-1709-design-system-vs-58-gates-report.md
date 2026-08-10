# Hallmark audit — Fourty design & design system

**Date** 2026-08-10 · **Branch** `design/logo-artwork-v2` · **Verb** `hallmark audit` (read-only, no edits)

**Reference** [usehallmark.com](https://www.usehallmark.com) → skill `nutlope/hallmark` v1.1, pulled to a
scratch dir and applied in full: `SKILL.md`, `references/verbs/audit.md`, `references/anti-patterns.md`,
`references/slop-test.md` (58 gates). Not installed into `~/.claude/skills/` — say the word and it lands there.

**Target** `src/app/globals.css`, `src/components/ui/**`, `src/components/*.tsx`, `src/app/(app)/**`,
`src/app/login/**`, `docs/design-guidelines.md`, `.design-sync/conventions.md`, `ds-bundle/`.

## Genre and which gates were waived

Hallmark grades against a declared genre. Fourty is a self-hosted B2B CRM → **modern-minimal**
(Stripe / Linear school). That waives two gates the repo would otherwise fail:

- **Gate 7** (pure `#fff`) — `--surface: oklch(1 0 0)` is allowed. Waived.
- **Gate 22** (zero-chroma neutral) — same token. Waived.

Not applicable, because this is an app shell and not a marketing page: gates 6, 42, 43, 44, 45
(hero shape / nav fingerprint / footer fingerprint / hero fit / hero decoration), gate 20
(Hallmark macrostructure stamp — the project was not built by Hallmark), gates 8/21/32/57
(macrostructure diversification).

Everything else was applied as written.

---

## Critical

### [critical] Design-system drift — the exported system does not describe the shipped UI

`src/app/globals.css:269-307` · `src/components/ui/{button,input,card}.tsx` · all of `src/app/(app)/**`

Two parallel implementations of the same three primitives ship side by side:

| Primitive | Legacy CSS class | shadcn/Base UI component | Ratio |
|---|---|---|---|
| Button | `.btn-primary` / `.btn-ghost` / `.btn-danger` — 66 uses | `<Button>` — 9 uses | 7:1 |
| Input | `.input` — 61 uses | `<Input>` — 5 uses | 12:1 |
| Card | `.card` — 47 uses | `<Card>` — **0 uses** | ∞ |

They are not equivalent. `.btn-primary` computes to 36px tall (`py-2` + `text-sm`, no border),
`.btn-ghost` to 38px (same padding + a 1px border), `.input` to 38px, `<Button size="default">` to
36px (`h-9`), `<Input>` to 36px (`h-9`). A `.btn-ghost` next to a `.btn-primary` is 2px taller than
its sibling; `src/app/login/login-form.tsx:50-94` stacks 38px inputs above a 36px submit.

This is what `audit.md` calls **design-system drift**, and it is the finding with the longest tail.
`.design-sync/conventions.md` tells a design agent *"Library components carry the controls"* and
demos `<Card><CardHeader><CardTitle>` — a composition the product renders **zero** times. The
193-component bundle in `ds-bundle/` documents a library the app does not use, so every card in the
Design System pane is an accurate picture of code that is not on screen. Any fix applied to one
implementation silently misses the other.

**Fix.** Pick one. Either delete the `.btn-*` / `.input` / `.card` layer and codemod 174 call sites
onto the components, or demote the components to internal primitives and document the CSS classes as
the real system. Whichever way, `conventions.md` and the exported bundle have to describe what ships.

### [critical] Contrast — four measured failures, all in non-token colour

Gates 40 & 41. Computed WCAG 2.1 against the real composited grounds (`--surface`, `--bg`, both themes);
script and method reproduce the repo's own `tests/semantic-tokens.test.ts` approach.

| Where | Pair | Ratio | Need |
|---|---|---|---|
| `settings/import/import-client.tsx:78` | `text-emerald-600` on `.card` (white) | **3.67** | 4.5 |
| `settings/sections/members.tsx:115` | `text-amber-600` (12px bold) on `bg-amber-500/10` | **2.95** | 4.5 |
| `settings/sections/api-keys.tsx:77` | same pair | **2.95** | 4.5 |
| `components/ai-chat.tsx:261` | `text-red-600` on `bg-red-500/10` — **no `dark:` variant** | 4.13 light / **3.37 dark** | 4.5 |
| `components/agent-panel/index.tsx:454` | same pair, same missing variant | 4.13 / **3.37** | 4.5 |

The 2.95:1 case is the headline of a warning banner — the highest-stakes text in the settings screens.

Every *token* in the same slot passes: `--status-customer` 4.65, `--score-hot` 4.73,
`--priority-medium` 5.03 (that last one is the exact slot the 2.95 amber occupies). The tokens are
right. The freestyle around them is what fails.

**Fix.** Replace each ad-hoc pair with the measured token that already exists for that meaning —
`text-priority-medium` + `bg-priority-medium-wash` for the amber banners, `--status-customer` for the
success line, `--destructive`/`--score-hot` for the error bubbles. No new tokens needed.

### [critical] Inter-everywhere — gate 1 (standing brand decision, flagged not reversed)

`src/app/globals.css:24-31` · `src/app/layout.tsx:3`

Hallmark's first and loudest rule: *"Pair a display face with a body face. Never one font doing both
jobs."* Fourty resolves `--font-display: var(--font-sans)` → Inter, and Inter carries both roles.
Hallmark names this exact case ("Inter, or Roboto, or Open Sans, used as both display and body") as a
critical tell.

**This is a decision already taken, not an oversight.** `docs/design-guidelines.md:120-124` and
`.design-sync/NOTES.md:180-182` record it as the brand owner's confirmation, reasoned from the fact
that the lockup is drawn artwork whose own typeface has nothing to do with the product's. I am not
reversing it. The trade-off, stated plainly so the call can be re-taken with the reference in view:

- **Keep one face** — the reasoning holds, one less webfont, hierarchy carried by weight and
  tracking. Cost: Hallmark grades the product as templated on its single most-weighted rule, and
  `--font-display` stays a role name pointing at nothing.
- **Add a display face** — the role token already exists and is wired everywhere, so this is a
  one-line change plus a font load. Cost: a second family to license, host, and defend, on a product
  whose whole visual argument is restraint.

A related observation either way: **`--font-display` is declared and referenced exactly zero times in
`src/`** (only its own definition at `globals.css:31`). The role is not just resolving to Inter, it is
unused — so today the token buys nothing at all. If the decision is to keep one face, the honest
version is to apply `font-display` on the surfaces that are meant to carry the brand register (page
`h1`s, the login heading, KPI figures), so the role means something the day a face arrives.

---

## Major

### [major] Token improvisation — gate 48

**54 raw Tailwind palette utilities across 17 files.** The design system declares a two-layer token
architecture and `conventions.md` says *"Read it before inventing a colour"* — and then the app layer
invents them anyway: `bg-red-500/10`, `text-amber-600`, `text-emerald-800`, `border-amber-400/50`.

Worst instance — `src/components/record-panels.tsx:24-29`: the activity-timeline dots are a
**second, unmeasured, six-hue colour system** (`emerald-400`, `slate-400`, `violet-400`, `amber-400`,
`teal-400`, `fuchsia-400`) sitting beside the measured one. Violet, teal and fuchsia have no
relationship to the warm-stone-plus-one-orange anchor the rest of the product is built on.

**Fix.** Lift every recurring pair into the semantic layer next to `--status-*` / `--score-*` /
`--priority-*` (`--feedback-warn`, `--feedback-ok`, `--feedback-error`, `--timeline-*`), measure them
against their own washes the way the existing ones were, and add them to `tests/semantic-tokens.test.ts`.
That test is the reason the existing tokens are correct; the ad-hoc colours fail precisely because
nothing measures them.

### [major] Emoji as icon — gate 30(b)

`src/components/ui.tsx:161` — `ScoreBadge` renders `🔥` / `🌤` / `❄️` as the score-band glyph.
`src/app/(app)/dashboard/dashboard-client.tsx:103` — `🔥 Hottest leads` as an `h2`.
`:143` — `Nothing due. 🎉`.

Hallmark's named tell: emoji standing in for an icon library. They render per-OS, they break the
stroke voice of the surrounding icon set, and inside `ScoreBadge` the three glyphs have different
advance widths, so the numeral after them does not align down a column. This one sits in a **design
system component**, so it propagates everywhere the badge is used.

**Fix.** The colour wash already encodes the band. Drop the glyph, or draw three 12px marks in
`icons.tsx` matching the existing stroke voice. Drop `🎉` outright — silent success is the house style.

### [major] Mixed icon libraries — gate 30(a)

`src/components/icons.tsx` (hand-drawn set, 18×18, `stroke-width: 2`) and `lucide-react`
(24×24 viewBox, 13 import sites incl. `shell.tsx`, `app-sidebar.tsx`, `command-palette.tsx` and 10
`ui/*` primitives) ship in the same views. Two stroke voices at two nominal sizes.

**Fix.** Pick one canon. Lucide is the shadcn default and already carries the primitives; if the
hand-drawn set stays, it should be the only set, and the `ui/*` chevrons/checks need drawing to match.

### [major] Focus rings animate in — gate 15 (plus gate 10, `transition-all`)

`src/components/ui/button.tsx:7`, `badge.tsx:8`, `tabs.tsx:61`, `switch.tsx:19`, `sidebar.tsx:292`
carry `transition-all`; `src/components/ui/input.tsx:12` carries `transition-[color,box-shadow]`;
`src/app/globals.css:270,276` carry a bare `transition`. In all cases the focus ring is a
box-shadow (`ring-3` / `focus:ring-2`), so it is inside the transitioned property set and **fades in
over ~150ms**. Gate 15 is explicit: focus rings appear instantly, always — a keyboard user has no
indicator during the fade.

Gate 10 fires on the same lines independently: `transition-all` animates every property including
ones that must be instant.

**Fix.** Name the properties and leave box-shadow out of the focus path, e.g.
`transition: color 150ms, background-color 150ms, border-color 150ms`. Where the ring itself must
animate for another reason, add `transition-property: none` under `:focus-visible`.

### [major] Tabular data without `tabular-nums`

Six number-formatting call sites (`Intl.NumberFormat` / `toLocaleString`) feed currency, score and
count columns across deals, reports and the dashboard. `tabular-nums` appears exactly twice in the
whole repo — `ui/chart.tsx:256` (a tooltip) and `ui/sidebar.tsx:592` (a badge). Every actual column
of figures uses Inter's proportional figures, so digits do not align vertically down a table.

**Fix.** `font-variant-numeric: tabular-nums` on `.td`, on `KpiCard`'s value, and on the deal-amount
cells — or globally on any `<table>` in the base layer.

### [major] Native `confirm()` for reversible actions

Nine sites: `settings/sections/{members,custom-fields,mailbox,sso,api-keys}.tsx`,
`contacts/[id]/contact-detail.tsx:70`, `deals/[id]/deal-detail.tsx:78`,
`companies/[id]/company-detail.tsx:73`, `workflows/workflows-client.tsx:50`.

Two tells at once. Hallmark's *"Confirmation dialogs for reversible actions"* — deleting one workflow
or one custom field is a soft delete-and-undo, not a modal moment. And the mechanism is an unstyled OS
dialog, which is the one surface in the product that no token reaches: the design system stops at the
browser chrome boundary.

**Fix.** Optimistic action plus a 5–10s Undo affordance for the reversible ones. Keep a real modal
(the `Dialog` primitive, which already ships) for the genuinely irreversible ones — removing a member,
revoking a key — and there use type-the-name rather than click-OK.

### [major] Tooltip hover delay equals focus delay — gate 17

`src/components/ui/tooltip.tsx:8` — `delay = 0` for both intents. Hover wants 800–1000ms (the pointer
crosses tooltips it did not ask for); focus wants 0ms (the keyboard user asked). One value cannot
serve both.

**Fix.** `delay = 800`, `closeDelay` as-is, and pass `0` on the focus path.

### [major] Input and button heights diverge — gate 39

Covered under the drift finding above; recorded separately because gate 39 names it: on the same form,
`.input` is 38px and `.btn-primary` is 36px. Gate 39 also asks for a 44px shared base — a dense admin
UI has a real argument against 44px, and 36–38px still clears the WCAG 2.5.8 24px target floor, so the
finding here is the *mismatch*, not the absolute value.

**Fix.** One base height token for all form-row controls; let the density argument choose its value.

---

## Minor

- **Placeholder names in shipped UI — gate 19.** `settings/import/import-client.tsx:93-94` shows
  users a CSV sample reading `Jane Doe,jane@acme.com,…` / `John Smith,john@globex.io,…`. Hallmark
  names *"Jane Doe / John Smith"* and *"Acme"* explicitly. `src/db/seed.ts` already gets this right
  (Maya Chen, realistic domains) — the sample should borrow from it. `companies/company-form.tsx:51`
  uses `acme.com` as a placeholder.
- **No `overflow-x: clip` on `html` / `body` — gate 34.** Hallmark treats it as a hard requirement,
  not a fix-on-observation. Use `clip`, never `hidden` — `hidden` breaks the sticky headers in
  `shell.tsx:96,108`.
- **Display headings lack `overflow-wrap: anywhere; min-width: 0` — gate 51.** `break-words` appears
  on two record-detail values only. Record names are user data and can be a single long token.
- **Theme-colour hexes duplicate tokens — gate 48 (minor).** `src/app/layout.tsx:22-23` hardcodes
  `#fdfbfa` / `#131110`, hand-copies of `--bg` light/dark. Nothing keeps them in step with a palette
  change; `.design-sync/NOTES.md` already documents exactly this class of drift for the accent.
- **Spacing off the 4px grid — gate 24 (soft).** `py-2.5` / `px-3.5` / `py-0.5` resolve to 10px / 14px
  / 2px. Tailwind's 0.25rem scale *is* a named scale, so this is not the arbitrary-`17px` case the
  gate targets, but it is not multiples of four either. Worth a decision, not a fix.
- **`.input` uses `:focus`, not `:focus-visible`, and rings via box-shadow rather than `outline` —
  gate 39.** `:focus` on a text input is defensible (mouse users want the ring too). The box-shadow
  ring is the shadcn idiom; the real cost is that it lands inside `transition`, which is the gate-15
  finding above.

---

## What passes — and it is most of the system

Named so the fixes above do not read as a verdict on the whole. Against the 58 gates, Fourty clears:

- **Gate 2, 29** — no gradient anywhere. No purple, no aurora blob, no `background-clip: text`.
- **Gate 12, 27** — `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` is precisely the exponential
  ease-out Hallmark asks for, and `globals.css:359-380` ships a reduced-motion *alternative* (the
  entrance still resolves, it just does not travel) rather than a blanket cancellation. This is the
  gate most projects fail; Fourty over-delivers on it.
- **Gate 22, 23** — OKLCH throughout, one anchor hue read off the artwork rather than chosen beside
  it, neutrals genuinely tinted on the brand's warm axis, and a written ~5% accent budget with the
  ramp step for each use (fill / text / hover / wash) fixed by rule.
- **Gate 11, 13, 38a** — no `hover:scale-105`, no stacked hover effects, no italic headings anywhere.
- **Gate 4, 5** — no card-in-card, no side-stripe cards. Separation is a 1px line, not a shadow.
- **Gate 33** — `icons.tsx:14` sets `aria-hidden` on every decorative SVG by default.
- **Gate 46** — no invented metrics. Stronger than the gate asks: `KpiCard`'s `hint` slot exists
  specifically so no figure ships unqualified.
- **Gate 16, 31, 47** — no toast library at all, no Lottie, no Three.js, no re-drawn browser or
  terminal chrome.
- **Gate 37** — two families (Inter, plus the mono stack in tool-name spans), under the three-family cap.
- **Gate 56** — the two `sticky top-0` headers in `shell.tsx` are mutually exclusive by breakpoint.

The measured-token layer deserves its own line: `--status-*` / `--score-*` / `--priority-*` are each
generated against their own composited wash, per theme, and re-measured by a test. That is a stricter
discipline than gate 40 asks for, and it is exactly why the four contrast failures above are all in
code that bypasses it.

---

## Summary

**3 critical · 9 major · 6 minor**

**Verdict — the system passes; the application layer drifts from it.**

Hallmark's stock verdicts are *ships as slop* / *reads as AI-generated* / *close, fix the minors*.
None fits, so here is the honest one. Fourty's design *system* — tokens, ramp, motion, semantics —
is better than the gates require and would pass an audit on its own. What fails is the layer above it:
174 call sites on a primitive layer the exported system does not document, 54 raw palette utilities
routed around the measured tokens, and four contrast failures every one of which lives in that
unmeasured code. The one finding that is genuinely about taste rather than drift is the single
typeface, and that is a decision on record.

Cheapest path to a clean re-audit, in order: the five contrast lines (one-line token swaps), the
emoji in `ScoreBadge`, the focus-ring transitions, `tabular-nums`, then the two-implementations
question — which is a scoping conversation, not a patch.

## Unresolved questions

1. **One typeface or two?** The reference's loudest rule against a decision already taken and
   documented. Keeping it is defensible; if it stays, should `font-display` at least be *applied* so
   the role is real?
2. **Which primitive layer is the real one** — `.btn-*` / `.input` / `.card`, or the shadcn
   components? Everything about the exported design system depends on the answer, and 174 call sites
   move either way.
3. **Do the timeline dots need six hues at all?** A value ladder in warm neutrals — the approach
   `--chart-1…5` already takes — would carry the same information without a second colour system.
4. **44px control height?** Gate 39's floor versus the product's stated information density. The
   mismatch needs fixing regardless; the target value is a product call.
5. **Install the Hallmark skill to `~/.claude/skills/hallmark/`** so future sessions can run
   `hallmark audit` directly? It was read from a scratch copy this time, nothing global was changed.
