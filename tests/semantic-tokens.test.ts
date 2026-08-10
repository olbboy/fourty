import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio } from "@/lib/contrast-color";

/**
 * The record-semantic chips are a 10% wash of a colour with that same colour,
 * adjusted, as the text on top. The wash lifts the ground toward the text, so
 * the pair only works if it was measured together — and a pair that misses by a
 * tenth still looks completely fine, which is why nothing catches it by eye.
 *
 * These read the real values out of globals.css so that hand-editing one half
 * of a pair fails here rather than in production.
 */
const CSS = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** --surface in each theme: the ground a chip's wash is painted over. */
const SURFACE = { light: "#ffffff", dark: "#1d1916" };
const WASH_ALPHA = 0.1;
const AA = 4.5;

const TOKENS = [
  "status-lead",
  "status-qualified",
  "status-customer",
  "status-churned",
  "score-hot",
  "score-warm",
  "score-cold",
  "priority-high",
  "priority-medium",
  "priority-low",
];

/** Values live twice: once in `:root`, once in `.dark`. Take them in order. */
function declarations(name: string): string[] {
  return [...CSS.matchAll(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "gm"))].map((m) => m[1].trim());
}

function washBase(name: string): string {
  const m = new RegExp(`--${name}-wash:\\s*color-mix\\(in srgb,\\s*(#[0-9a-f]{6})`, "i").exec(CSS);
  if (!m) throw new Error(`--${name}-wash is missing or not a color-mix of a hex`);
  return m[1];
}

/** Composite the wash over a surface to get the ground the text actually sits on. */
function ground(base: string, surface: string): string {
  const px = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, s] = [px(base), px(surface)];
  const mix = f.map((c, i) => Math.round(c * WASH_ALPHA + s[i] * (1 - WASH_ALPHA)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

describe("semantic chip tokens clear AA against their own wash", () => {
  it.each(TOKENS)("%s", (name) => {
    const [lightFg, darkFg] = declarations(name);
    expect(lightFg, `--${name} missing from :root`).toBeTruthy();
    expect(darkFg, `--${name} missing from .dark`).toBeTruthy();

    const base = washBase(name);
    expect(contrastRatio(lightFg, ground(base, SURFACE.light))).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkFg, ground(base, SURFACE.dark))).toBeGreaterThanOrEqual(AA);
  });

  it("declares a wash for every foreground, and no orphans", () => {
    for (const name of TOKENS) {
      expect(CSS, `--${name}-wash`).toContain(`--${name}-wash:`);
      expect(CSS, `--color-${name}`).toContain(`--color-${name}: var(--${name})`);
      expect(CSS, `--color-${name}-wash`).toContain(`--color-${name}-wash: var(--${name}-wash)`);
    }
  });

  it("keeps the light and dark foregrounds genuinely different", () => {
    // One value cannot serve both grounds — that was the bug this layer replaced.
    for (const name of TOKENS) {
      const [light, dark] = declarations(name);
      expect(light, `--${name} is the same in both themes`).not.toBe(dark);
    }
  });
});
