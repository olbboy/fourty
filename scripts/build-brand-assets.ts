/**
 * Generate everything derived from brand/logo-master.svg.
 *
 *   npm run build:brand
 *
 * The master is the only hand-maintained artwork. This script splits it into the
 * two lockups and writes the three kinds of consumer:
 *
 *   src/lib/brand-artwork.ts   geometry for <Logo>, so React renders it inline
 *   public/brand/*.svg         the lockups as files, for docs and press
 *   public/icon.svg            the favicon / PWA icon — the compact lockup
 *                              centred in a square
 *
 * Output is committed. The point of generating it is that the tab icon can
 * never drift away from the sidebar: there is one drawing, not four copies.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MASTER = path.join(ROOT, "brand", "logo-master.svg");

/** The artwork's own colours, read off the master rather than restated here. */
const INK = "#231F20";
const ORANGE = "#FB631A";
/**
 * Ink for dark grounds. The artwork ships no inverse, so this is the palette's
 * own dark-mode text colour (`--text` in .dark) rather than a flat white: on a
 * warm near-black rail a cool white reads as a different brand leaking in.
 */
const INK_INVERSE = "#fbfaf8";

/** Full lockup extents, from the master's viewBox. */
const FULL_WIDTH = 1457.6;
const HEIGHT = 302;
/**
 * Right edge of the compact lockup — the orange O's, and also what the designer
 * ships as the compact file's own viewBox width. Re-measure if the artwork
 * changes: load the master in a browser and read
 * `document.querySelector("#compact").getBBox()`.
 *
 * The supplied compact file is 2 units taller than the full lockup (304 vs 302)
 * — pure bottom padding, since the shapes are byte-identical. Both lockups use
 * the master's 302 so they share a baseline when one swaps for the other.
 */
const COMPACT_WIDTH = 509.2;

type Shape = { d: string; orange: boolean };

/** `<polygon points>` → a closed path, so downstream only ever handles `d`. */
function polygonToPath(points: string): string {
  const nums = points.trim().split(/[\s,]+/).map(Number);
  const pairs: string[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push(`${nums[i]},${nums[i + 1]}`);
  return `M${pairs.join("L")}Z`;
}

/** Read one attribute off an element's source text. */
function attr(el: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(el)?.[1] ?? null;
}

/**
 * Pull the shapes out of one `<g id="...">` of the master.
 *
 * Every element in the group must yield a shape. Parsing that silently skipped
 * one would not fail the build — it would ship a logo with a missing stroke —
 * so the count is asserted rather than trusted.
 */
function shapesIn(svg: string, groupId: string): Shape[] {
  const group = new RegExp(`<g id="${groupId}">([\\s\\S]*?)</g>`).exec(svg);
  if (!group) throw new Error(`brand master has no <g id="${groupId}">`);

  const elements = [...group[1].matchAll(/<(polygon|path)\b[^>]*>/g)].map((m) => m[0]);
  const shapes: Shape[] = [];
  for (const el of elements) {
    const fill = attr(el, "fill");
    const geometry = attr(el, "d") ?? (attr(el, "points") && polygonToPath(attr(el, "points")!));
    if (!fill || !geometry) continue;
    shapes.push({ d: geometry, orange: fill.toUpperCase() === ORANGE });
  }
  if (shapes.length !== elements.length) {
    throw new Error(
      `<g id="${groupId}">: parsed ${shapes.length} of ${elements.length} elements — ` +
        `every shape needs a fill and a d/points attribute`,
    );
  }
  if (!shapes.length) throw new Error(`<g id="${groupId}"> holds no shapes`);
  return shapes;
}

const master = readFileSync(MASTER, "utf8");
const compact = shapesIn(master, "compact");
const lettering = shapesIn(master, "lettering");

const VARIANTS = {
  full: { width: FULL_WIDTH, height: HEIGHT, minHeight: 20, shapes: [...compact, ...lettering] },
  compact: { width: COMPACT_WIDTH, height: HEIGHT, minHeight: 16, shapes: compact },
} as const;

// ── src/lib/brand-artwork.ts ───────────────────────────────────────────────
const module = `/**
 * The Fourty brand artwork.
 *
 * GENERATED from brand/logo-master.svg by scripts/build-brand-assets.ts.
 * Do not edit — change the master and run \`npm run build:brand\`.
 *
 *   full     the whole lockup
 *   compact  the 40 monogram, for square and narrow surfaces
 */

export const INK = ${JSON.stringify(INK)};
export const INK_INVERSE = ${JSON.stringify(INK_INVERSE)};
export const BRAND_ORANGE = ${JSON.stringify(ORANGE)};

export const ART = {
${Object.entries(VARIANTS)
  .map(
    ([name, v]) => `  ${name}: {
    width: ${v.width},
    height: ${v.height},
    /** Minimum legible height, per the brand rules. */
    minHeight: ${v.minHeight},
    shapes: [
${v.shapes.map((s) => `      { d: ${JSON.stringify(s.d)}, orange: ${s.orange} },`).join("\n")}
    ],
  },`,
  )
  .join("\n")}
} as const;

export type LogoVariant = keyof typeof ART;
`;

// ── public/brand/*.svg and public/icon.svg ─────────────────────────────────
function lockup(variant: keyof typeof VARIANTS, ink: string): string {
  const v = VARIANTS[variant];
  const body = v.shapes
    .map((s) => `<path d="${s.d}" fill="${s.orange ? ORANGE : ink}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v.width} ${v.height}" fill="none">${body}</svg>\n`;
}

/**
 * The compact lockup centred in a square, for the favicon and installed icon.
 *
 * No tile behind it: the O is the brand orange and a brand-orange ground would
 * swallow it — exactly the mistake the retired placeholder made. That leaves the
 * letterforms transparent-backed, which is why the ink flips with
 * prefers-color-scheme: a near-black 4 is invisible against a dark browser tab
 * strip, and a favicon has no parent to inherit a ground from.
 */
function appIcon(): string {
  const v = VARIANTS.compact;
  const box = 64;
  const pad = 6;
  const scale = (box - pad * 2) / v.width;
  const top = (box - v.height * scale) / 2;
  const body = v.shapes
    .map((s) =>
      s.orange
        ? `<path d="${s.d}" fill="${ORANGE}"/>`
        : `<path class="ink" d="${s.d}" fill="${INK}"/>`,
    )
    .join("");
  const style =
    `<style>@media (prefers-color-scheme: dark){.ink{fill:${INK_INVERSE}}}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" fill="none">${style}<g transform="translate(${pad} ${top.toFixed(3)}) scale(${scale.toFixed(6)})">${body}</g></svg>\n`;
}

mkdirSync(path.join(ROOT, "public", "brand"), { recursive: true });
writeFileSync(path.join(ROOT, "src", "lib", "brand-artwork.ts"), module);
const files: Record<string, string> = {
  "logo-full.svg": lockup("full", INK),
  "logo-full-inverse.svg": lockup("full", INK_INVERSE),
  "logo-compact.svg": lockup("compact", INK),
  "logo-compact-inverse.svg": lockup("compact", INK_INVERSE),
};
for (const [name, body] of Object.entries(files)) {
  writeFileSync(path.join(ROOT, "public", "brand", name), body);
}
writeFileSync(path.join(ROOT, "public", "icon.svg"), appIcon());

console.log(`brand: ${Object.keys(files).length + 2} file(s) from ${path.relative(ROOT, MASTER)}`);
