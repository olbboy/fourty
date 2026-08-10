/**
 * Readable foregrounds for colours that come from data, not from the palette.
 *
 * Pipeline stages carry their own hex so a workspace can recolour its board, so
 * the UI cannot know at build time whether a stage is near-black or near-yellow.
 * Hardcoding `text-white` on top of one is how an amber stage ends up at 1.8:1.
 * These helpers pick a foreground that actually clears WCAG AA against whatever
 * the row holds.
 *
 * The design system makes the same call for the brand orange itself: a filled
 * accent control carries ink, not white, because at that lightness ink wins.
 */

/** The palette's ink — the same near-black `--brand-ink` the DS fills with. */
const INK = "#101010";
const WHITE = "#ffffff";

/** AA for normal-size text. */
const AA = 4.5;

type Rgb = [number, number, number];

/** Parse `#rgb` / `#rrggbb` into 0–1 channels. Unparseable input reads as mid grey. */
function parseHex(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0.5, 0.5, 0.5];
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function toHex([r, g, b]: Rgb): string {
  const enc = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${enc(r)}${enc(g)}${enc(b)}`;
}

/** sRGB → linear, the WCAG transfer function. */
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(linearize) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast between two hex colours. Exported for tests and for callers that want to assert. */
export function contrastRatio(a: string, b: string): number {
  return ratio(luminance(parseHex(a)), luminance(parseHex(b)));
}

/**
 * The better foreground for text sitting directly on `background` — ink or
 * white, whichever has more contrast. Use for a solid fill in a data colour.
 */
export function readableOn(background: string): string {
  const bg = luminance(parseHex(background));
  return ratio(luminance(parseHex(INK)), bg) >= ratio(luminance(parseHex(WHITE)), bg) ? INK : WHITE;
}

/**
 * `color` darkened just far enough to clear AA against `on` (default: the page
 * ground). Use when the data colour is the TEXT — a stage name written in its
 * own colour, or saturated text on a 10% wash of itself.
 *
 * Darkening scales the channels rather than converting through a perceptual
 * space: it holds the hue well enough at these steps, and the alternative is a
 * colour-space round trip for a value that only has to clear a threshold.
 */
export function readableInk(color: string, on: string = WHITE): string {
  const target = luminance(parseHex(on));
  let rgb = parseHex(color);
  // 40 steps of 5% reaches black, so the loop always terminates at a colour
  // that clears AA against any ground lighter than black.
  for (let i = 0; i < 40; i++) {
    if (ratio(luminance(rgb), target) >= AA) break;
    rgb = rgb.map((c) => c * 0.95) as Rgb;
  }
  return toHex(rgb);
}
