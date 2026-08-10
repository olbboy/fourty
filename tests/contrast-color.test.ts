import { describe, it, expect } from "vitest";
import { contrastRatio, readableInk, readableOn } from "@/lib/contrast-color";

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
  "#f86008", // the brand orange
];

const AA = 4.5;

describe("readableOn — text sitting on a filled data colour", () => {
  it("clears AA on every seeded stage colour", () => {
    for (const bg of STAGE_COLOURS) {
      expect(contrastRatio(readableOn(bg), bg), `foreground on ${bg}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("picks ink on light fills and white on dark ones", () => {
    expect(readableOn("#ffb900")).toBe("#101010");
    expect(readableOn("#f86008")).toBe("#101010"); // the DS's own ink-on-orange rule
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
    expect(readableOn("#fff")).toBe("#101010");
    expect(() => readableInk("not-a-colour")).not.toThrow();
  });
});
