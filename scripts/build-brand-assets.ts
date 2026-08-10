/**
 * Write the static brand files from the artwork in src/lib/brand-artwork.ts.
 *
 * A browser asks for the favicon and the PWA icon as files, so those cannot come
 * from the React component — but they must not be a second, hand-kept copy of
 * the geometry either, or the tab icon quietly drifts from the sidebar. This
 * script is the join: one source, both consumers.
 *
 *   npm run build:brand
 *
 * Re-run it whenever the artwork changes; the output is committed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ART, BRAND_ORANGE, INK, INK_INVERSE, type LogoVariant } from "../src/lib/brand-artwork";

const OUT = path.join(process.cwd(), "public", "brand");

/** The lockup at its natural proportions — for READMEs, docs, press. */
function lockup(variant: LogoVariant, ink: string): string {
  const art = ART[variant];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.width} ${art.height}" fill="none">`,
    `<path d="${art.ink}" fill="${ink}" fill-rule="evenodd"/>`,
    `<path d="${art.o}" fill="${BRAND_ORANGE}" fill-rule="evenodd"/>`,
    `</svg>`,
    ``,
  ].join("");
}

/**
 * The mark centred in a square, for the favicon and the installed app icon.
 *
 * No container and no fill behind it: the O is the brand orange, so a brand
 * orange tile would swallow it — the exact mistake the retired placeholder made.
 * Clear space is the height of the O on every side, as the brand rules ask.
 */
function appIcon(ink: string): string {
  const art = ART.mark;
  const box = 64;
  const pad = 6;
  const scale = (box - pad * 2) / art.width;
  const drawnHeight = art.height * scale;
  const top = (box - drawnHeight) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" fill="none">`,
    `<g transform="translate(${pad} ${top.toFixed(3)}) scale(${scale.toFixed(6)})">`,
    `<path d="${art.ink}" fill="${ink}" fill-rule="evenodd"/>`,
    `<path d="${art.o}" fill="${BRAND_ORANGE}" fill-rule="evenodd"/>`,
    `</g></svg>`,
    ``,
  ].join("");
}

mkdirSync(OUT, { recursive: true });

const files: Record<string, string> = {
  "logo-wordmark.svg": lockup("wordmark", INK),
  "logo-wordmark-inverse.svg": lockup("wordmark", INK_INVERSE),
  "logo-mark.svg": lockup("mark", INK),
  "logo-mark-inverse.svg": lockup("mark", INK_INVERSE),
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(path.join(OUT, name), body);
}
// The app icon lives at the root because that is where the manifest and the
// metadata `icons` entry point.
writeFileSync(path.join(process.cwd(), "public", "icon.svg"), appIcon(INK));

console.log(`wrote ${Object.keys(files).length + 1} brand file(s)`);
