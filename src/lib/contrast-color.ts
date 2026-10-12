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
const INK = "#231f20";
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
 * The better foreground for text sitting directly on `background`. Prefers the
 * palette's ink or white; if a mid-tone leaves both of those short of AA it
 * falls back to pure black or white, which is the most contrast available.
 * Use for a solid fill in a data colour.
 */
export function readableOn(background: string): string {
  const bg = luminance(parseHex(background));
  const best = ratio(luminance(parseHex(INK)), bg) >= ratio(luminance(parseHex(WHITE)), bg) ? INK : WHITE;
  if (ratio(luminance(parseHex(best)), bg) >= AA) return best;
  // A mid-tone fill (roughly #767676) is out of reach of both palette values.
  return bg > 0.18 ? "#000000" : "#ffffff";
}

/**
 * `color` pushed just far enough away from `on` to clear AA against it. Use
 * when the data colour is the TEXT — a stage name written in its own colour, or
 * saturated text on a 10% wash of itself.
 *
 * The direction follows the ground: darken on a light ground, lighten on a dark
 * one. Getting this wrong is not a near miss — a colour darkened for white then
 * rendered on a near-black surface lands around 3.8:1, which is exactly what
 * this repo shipped before the ground was taken into account.
 *
 * Stepping scales the channels rather than converting through a perceptual
 * space: it holds the hue well enough at these steps, and the alternative is a
 * colour-space round trip for a value that only has to clear a threshold.
 */
export function readableInk(color: string, on: string = WHITE): string {
  const target = luminance(parseHex(on));
  const darken = target > 0.18; // a light ground wants darker text, and vice versa
  let rgb = parseHex(color);
  for (let i = 0; i < 40; i++) {
    if (ratio(luminance(rgb), target) >= AA) return toHex(rgb);
    rgb = (darken ? rgb.map((c) => c * 0.95) : rgb.map((c) => c + (1 - c) * 0.08)) as Rgb;
  }
  // Stepping can stall on a ground that is itself mid-tone: nothing reachable
  // from this hue clears AA, so fall back to the guaranteed foreground.
  return ratio(luminance(rgb), target) >= AA ? toHex(rgb) : readableOn(on);
}

/**
 * The grounds a data colour is read against: `--surface` in each theme.
 *
 * They are repeated here because the value has to exist in JavaScript — the
 * colour being adjusted comes from the database, so the adjustment cannot be
 * done in CSS. Keep them in step with globals.css.
 */
const GROUND_LIGHT = "#ffffff";
const GROUND_DARK = "#1d1916";

/** Alpha of the wash a semantic chip paints behind its own text. */
const CHIP_WASH_ALPHA = 0x20 / 255;

/** `fg` at `alpha` painted over `bg`. */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

/**
 * Both readable inks for one data colour — light theme and dark theme.
 *
 * Callers hand both to CSS (see `.data-ink` in globals.css) rather than picking
 * one, because the theme is a class on the document and a server-rendered
 * inline style cannot know it. Doing it this way also means the colour is right
 * in the first painted frame instead of after a hydration pass.
 */
export function readableInkPair(color: string): { light: string; dark: string } {
  return {
    light: readableInk(color, GROUND_LIGHT),
    dark: readableInk(color, GROUND_DARK),
  };
}

/**
 * A semantic chip: a wash of the data colour with the same colour, darkened or
 * lightened, as the text on top.
 *
 * The ground is NOT the surface — it is the wash, and the wash is made of the
 * colour itself, so it moves the ground toward the text on exactly the colours
 * where contrast was already tightest. Measuring against the surface instead
 * put the amber stage at 4.21:1 in light mode: a near miss that looks fine and
 * fails. Returning the background alongside the inks is what keeps the alpha
 * used for the measurement and the alpha used for the paint the same number.
 */
export function washedChip(color: string): { background: string; light: string; dark: string } {
  const rgb = parseHex(color);
  const groundLight = toHex(composite(rgb, CHIP_WASH_ALPHA, parseHex(GROUND_LIGHT)));
  const groundDark = toHex(composite(rgb, CHIP_WASH_ALPHA, parseHex(GROUND_DARK)));
  return {
    background: `color-mix(in srgb, ${color} ${(CHIP_WASH_ALPHA * 100).toFixed(2)}%, transparent)`,
    light: readableInk(color, groundLight),
    dark: readableInk(color, groundDark),
  };
}
