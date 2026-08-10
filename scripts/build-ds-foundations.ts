/**
 * Emit the design system's foundation specimen cards into ds-bundle/guidelines/.
 *
 *   npm run build:ds-foundations      # after the design-sync converter has run
 *
 * WHY THIS EXISTS. The converter fills `guidelines/` from `guidelinesGlob`,
 * which takes markdown only — it skips HTML by design. But the DS pane builds
 * its card index from the `@dsCard` comment on the first line of any HTML, so
 * foundation swatches have to be HTML to show up as cards at all. This script is
 * that gap, and it runs AFTER the converter because the converter rewrites the
 * directory.
 *
 * WHY THE CARDS REFERENCE VARIABLES. Every swatch below paints itself with
 * `var(--token)` rather than a copied hex. A specimen sheet whose values are
 * transcribed goes stale the first time a token moves and nobody notices,
 * because a swatch always looks like a swatch. These cannot: they render
 * whatever the stylesheet currently says, so the only thing this script has to
 * keep in step is the *list* of tokens, not their values.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "ds-bundle", "guidelines");

const SHELL = (title: string, group: string, subtitle: string, viewport: string, body: string) =>
  `<!-- @dsCard group="${group}" name="${title}" subtitle="${subtitle}" viewport="${viewport}" -->
<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../styles.css">
<style>
  body { margin:0; padding:16px; background:var(--bg); color:var(--text); font-family:var(--font-sans); font-size:12px }
  .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center }
  .col { display:flex; flex-direction:column; gap:10px }
  .sw { width:92px; border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden }
  .sw i { display:block; height:40px }
  .sw b { display:block; padding:4px 6px; font-size:10px; font-weight:600 }
  .sw s { display:block; padding:0 6px 5px; font-size:9px; color:var(--text-muted); text-decoration:none }
  .chip { display:inline-flex; align-items:center; border-radius:9999px; padding:2px 9px; font-size:12px; font-weight:500; text-transform:capitalize }
  .note { color:var(--text-muted); font-size:11px; margin-top:10px; line-height:1.5 }
</style></head><body>${body}</body></html>
`;

/** A swatch that paints itself from a variable, so it cannot go stale. */
const swatch = (token: string, label: string) =>
  `<div class="sw"><i style="background:var(${token})"></i><b>${label}</b><s>${token}</s></div>`;

const chip = (fg: string, wash: string, label: string) =>
  `<span class="chip" style="color:var(${fg});background:var(${wash})">${label}</span>`;

const CARDS: Record<string, string> = {
  "color-brand.html": SHELL(
    "Brand accent",
    "Colors",
    "One orange, ramped — step 500 is the mark's own",
    "700x180",
    `<div class="row">${[50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
      .map((s) => swatch(`--color-accent-${s}`, String(s)))
      .join("")}</div>
     <p class="note">500 is the O in the logo. Fills use it with ink on top; accent-coloured
     TEXT uses 700, because the flat orange clears only 3.04:1 on white.</p>`,
  ),

  "color-surfaces.html": SHELL(
    "Surfaces and ink",
    "Colors",
    "Warm stone neutrals — the same hue family as the accent",
    "700x150",
    `<div class="row">${[
      ["--bg", "bg"],
      ["--surface", "surface"],
      ["--surface-2", "surface-2"],
      ["--border", "border"],
      ["--text", "text"],
      ["--text-muted", "text-muted"],
    ]
      .map(([t, l]) => swatch(t, l))
      .join("")}</div>
     <p class="note">The page ground sits a hair off white so a card lifts off it without a
     shadow. Separation is a 1px line, not elevation.</p>`,
  ),

  "color-status.html": SHELL(
    "Contact status",
    "Colors",
    "Four lifecycle values — 10% wash, measured text",
    "700x120",
    `<div class="row">${[
      ["lead", "lead"],
      ["qualified", "qualified"],
      ["customer", "customer"],
      ["churned", "churned"],
    ]
      .map(([k, l]) => chip(`--status-${k}`, `--status-${k}-wash`, l))
      .join("")}</div>
     <p class="note">Every semantic chip is a 10% wash behind saturated text, never a solid
     fill. The foreground is measured against that wash — a stricter ground than the surface.</p>`,
  ),

  "color-score.html": SHELL(
    "Lead score bands",
    "Colors",
    "Red / amber / blue — never orange",
    "700x120",
    `<div class="row">${[
      ["hot", "hot"],
      ["warm", "warm"],
      ["cold", "cold"],
    ]
      .map(([k, l]) => chip(`--score-${k}`, `--score-${k}-wash`, l))
      .join("")}</div>
     <p class="note">"Hot" is red rather than orange: an orange chip beside the brand-orange
     primary button stops meaning anything.</p>`,
  ),

  "color-priority.html": SHELL(
    "Task priority",
    "Colors",
    "Three levels on the same wash idiom",
    "700x120",
    `<div class="row">${[
      ["high", "high"],
      ["medium", "medium"],
      ["low", "low"],
    ]
      .map(([k, l]) => chip(`--priority-${k}`, `--priority-${k}-wash`, l))
      .join("")}</div>
     <p class="note">Priority shares the wash idiom with status and score, so the three
     read as one family rather than three inventions.</p>`,
  ),

  "color-charts.html": SHELL(
    "Chart series",
    "Colors",
    "A value ladder, plus three series that carry meaning",
    "700x170",
    `<div class="row">${[1, 2, 3, 4, 5]
      .map((n) => swatch(`--chart-${n}`, `chart-${n}`))
      .join("")}</div>
     <div class="row" style="margin-top:10px">${[
       ["--chart-accent", "accent"],
       ["--chart-positive", "won"],
       ["--chart-negative", "lost"],
     ]
       .map(([t, l]) => swatch(t, l))
       .join("")}</div>
     <p class="note">Categorical series are told apart by lightness, so a chart never competes
     with the one accent on the page. Hue is reserved for data that means something —
     won against lost.</p>`,
  ),

  "type-ramp.html": SHELL(
    "Type ramp",
    "Type",
    "Inter throughout; weight and tracking carry hierarchy",
    "700x260",
    `<div class="col">
      <div style="font-size:24px;font-weight:700;letter-spacing:-0.025em">Page title — 24px bold, -0.025em</div>
      <div style="font-size:14px;font-weight:600">Section heading — 14px semibold</div>
      <div style="font-size:14px">Body — 14px regular, the app's default size</div>
      <div style="font-size:12px;color:var(--text-muted)">Meta — 12px muted</div>
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.025em;color:var(--text-muted)">Eyebrow — 12px semibold uppercase</div>
     </div>
     <p class="note">Inside the product there is one face. A second typeface (the display
     face) belongs to brand and editorial surfaces only.</p>`,
  ),

  "radius.html": SHELL(
    "Radius",
    "Foundations",
    "One root value; every step derives from it",
    "700x140",
    `<div class="row">${[
      ["--radius-sm", "6px"],
      ["--radius-md", "8px · controls"],
      ["--radius-lg", "10px"],
      ["--radius-xl", "14px · cards"],
      ["--radius-4xl", "26px · pills"],
    ]
      .map(
        ([t, l]) =>
          `<div class="col" style="align-items:center;gap:4px"><div style="width:64px;height:44px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(${t})"></div><span style="font-size:9px;color:var(--text-muted)">${l}</span></div>`,
      )
      .join("")}</div>`,
  ),

  "elevation.html": SHELL(
    "Elevation",
    "Foundations",
    "Hairlines, not shadows — overlays are the exception",
    "700x150",
    `<div class="row">
      <div style="width:120px;height:64px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);display:flex;align-items:center;justify-content:center;font-size:11px">card · 1px line</div>
      <div style="width:120px;height:64px;background:var(--surface);border-radius:var(--radius-xl);box-shadow:0 4px 6px -1px rgb(0 0 0 / .1);display:flex;align-items:center;justify-content:center;font-size:11px">popover</div>
      <div style="width:120px;height:64px;background:var(--surface);border-radius:var(--radius-xl);box-shadow:0 10px 15px -3px rgb(0 0 0 / .1);display:flex;align-items:center;justify-content:center;font-size:11px">dialog</div>
     </div>
     <p class="note">A card separates with a line. Only things that float above the page get
     a shadow, and there are no inner shadows and no glow.</p>`,
  ),

  "motion.html": SHELL(
    "Motion",
    "Foundations",
    "120–180ms, exponential ease-out, nothing bounces",
    "700x140",
    `<div class="col">
      <div>fast <b style="font-weight:600">120ms</b> — small state changes</div>
      <div>base <b style="font-weight:600">150ms</b> — the transition default</div>
      <div>enter <b style="font-weight:600">180ms</b> — opacity plus a 4px rise, ease-out-expo</div>
     </div>
     <p class="note">Under prefers-reduced-motion every duration collapses to 1ms and the
     entrance resolves in place — the end state is always reached, never skipped.</p>`,
  ),
};

mkdirSync(OUT, { recursive: true });
for (const [name, html] of Object.entries(CARDS)) writeFileSync(path.join(OUT, name), html);
console.log(`foundations: ${Object.keys(CARDS).length} specimen card(s) → ${path.relative(process.cwd(), OUT)}`);
