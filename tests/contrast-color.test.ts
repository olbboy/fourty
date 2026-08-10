import { describe, it, expect } from "vitest";
import { contrastRatio, readableInk, readableInkPair, readableOn, washedChip } from "@/lib/contrast-color";

/**
 * Stage colours are workspace data, so the UI derives its foregrounds instead of
 * assuming one. These are the cases that used to render unreadable: a light
 * amber stage with white text, and a stage name written in its own bright hue.
 */

/** Every seeded stage colour, plus the brand orange the DS fills with. */
const STAGE_COLOURS = [
  "#a89f99", // Lead — warm neutral
  "#51a2ff", // Qualified
  "#a684ff", // Demo
  "#ffb900", // Proposal — the one that broke white text
  "#ff8b33", // Negotiation
  "#00d492", // Won
  "#ff6467", // Lost
  "#fb631a", // the brand orange, from brand/logo-master.svg
];

const AA = 4.5;

describe("readableOn — text sitting on a filled data colour", () => {
  it("clears AA on every seeded stage colour", () => {
    for (const bg of STAGE_COLOURS) {
      expect(contrastRatio(readableOn(bg), bg), `foreground on ${bg}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("picks ink on light fills and white on dark ones", () => {
    expect(readableOn("#ffb900")).toBe("#231f20");
    expect(readableOn("#fb631a")).toBe("#231f20"); // the logo's own ink-on-orange pairing
    expect(readableOn("#101010")).toBe("#ffffff");
  });
});

describe("readableInk — the data colour used as text", () => {
  it("darkens every seeded stage colour until it clears AA on white", () => {
    for (const c of STAGE_COLOURS) {
      expect(contrastRatio(readableInk(c), "#ffffff"), `${c} as text`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("leaves a colour that already clears AA alone", () => {
    const dark = "#1d4ed8";
    expect(contrastRatio(dark, "#ffffff")).toBeGreaterThanOrEqual(AA);
    expect(readableInk(dark)).toBe(dark);
  });

  it("honours a non-white ground", () => {
    // --surface-2, the wash a chip sits on.
    const ground = "#f5f4f2";
    expect(contrastRatio(readableInk("#ffb900", ground), ground)).toBeGreaterThanOrEqual(AA);
  });
});

describe("parsing", () => {
  it("accepts shorthand hex and tolerates junk without throwing", () => {
    expect(readableOn("#fff")).toBe("#231f20");
    expect(() => readableInk("not-a-colour")).not.toThrow();
  });
});

describe("readableInkPair — the same colour on both themes", () => {
  /** --surface in each theme, the grounds a chip actually sits on. */
  const GROUNDS = { light: "#ffffff", dark: "#1d1916" };

  it("clears AA on BOTH grounds for every seeded stage colour", () => {
    for (const c of STAGE_COLOURS) {
      const { light, dark } = readableInkPair(c);
      expect(contrastRatio(light, GROUNDS.light), `${c} on light`).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(dark, GROUNDS.dark), `${c} on dark`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("moves the colour in opposite directions for the two grounds", () => {
    // The regression this guards: a single value darkened for white was being
    // rendered on a near-black surface too, landing around 3.8:1.
    const { light, dark } = readableInkPair("#ffb900");
    expect(contrastRatio(light, "#ffffff")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(light, GROUNDS.dark)).toBeLessThan(AA); // why one value cannot serve both
    expect(contrastRatio(dark, GROUNDS.dark)).toBeGreaterThanOrEqual(AA);
  });
});

describe("washedChip — text on a wash of its own colour", () => {
  /** The wash is 12.5% of the colour over --surface; compose it the same way. */
  const WASH = 0x20 / 255;
  const over = (hex: string, ground: string) => {
    const px = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [f, g] = [px(hex), px(ground)];
    const mix = f.map((c, i) => Math.round(c * WASH + g[i] * (1 - WASH)));
    return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };

  it("clears AA against the WASH, not against the surface", () => {
    for (const c of STAGE_COLOURS) {
      const { light, dark } = washedChip(c);
      expect(contrastRatio(light, over(c, "#ffffff")), `${c} light`).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(dark, over(c, "#1d1916")), `${c} dark`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("is stricter than measuring against the bare surface", () => {
    // The amber stage is the case that exposed it: 4.54:1 on white, but the
    // wash lifts the ground and it lands at 4.21 — a fail that looks fine.
    const surfaceOnly = readableInkPair("#ffb900").light;
    expect(contrastRatio(surfaceOnly, "#ffffff")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(surfaceOnly, over("#ffb900", "#ffffff"))).toBeLessThan(AA);
    expect(contrastRatio(washedChip("#ffb900").light, over("#ffb900", "#ffffff"))).toBeGreaterThanOrEqual(AA);
  });
});
