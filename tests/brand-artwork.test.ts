import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ART, BRAND_ORANGE, INK } from "@/lib/brand-artwork";

/**
 * src/lib/brand-artwork.ts is generated from brand/logo-master.svg and
 * committed. Nothing forces the two to stay together — editing the master and
 * forgetting `npm run build:brand` would leave the favicon and the sidebar
 * drawing different logos, and neither the build nor the type checker would
 * notice. These assertions are that missing link.
 */
const master = readFileSync(path.join(process.cwd(), "brand", "logo-master.svg"), "utf8");

function shapesInGroup(id: string): string[] {
  const group = new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`).exec(master);
  if (!group) throw new Error(`master has no <g id="${id}">`);
  return [...group[1].matchAll(/<(polygon|path)\b[^>]*>/g)].map((m) => m[0]);
}

/**
 * A shape's coordinates in order, ignoring how they are written.
 *
 * The master draws straight runs as `<polygon points>` and curves as `<path d>`;
 * the build turns every polygon into a path, so the two spellings never match as
 * text even when they describe the same outline. Comparing the numbers compares
 * the drawing.
 */
function coords(shape: string): number[] {
  const geometry = /\b(?:d|points)="([^"]*)"/.exec(shape)?.[1] ?? "";
  return (geometry.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

/** The master's own frame — the single source of truth for both lockups. */
const frame = (() => {
  const viewBox = /<svg\b[^>]*\bviewBox="([^"]*)"/.exec(master)?.[1];
  const [minX, minY, width, height] = (viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  return { minX, minY, width, height };
})();

describe("brand artwork stays in step with the master", () => {
  const compact = shapesInGroup("compact");
  const lettering = shapesInGroup("lettering");

  it("carries every shape the master draws", () => {
    expect(ART.compact.shapes).toHaveLength(compact.length);
    expect(ART.full.shapes).toHaveLength(compact.length + lettering.length);
  });

  /**
   * Counting shapes only proves none went missing. The logo that shipped before
   * the designer's real export was the right NUMBER of paths carrying the wrong
   * coordinates — every count matched while the wordmark sat 2.7 units high.
   */
  it("draws the master's coordinates, not just the right number of shapes", () => {
    const fromMaster = [...compact, ...lettering].map(coords);
    expect(ART.full.shapes.map((s) => coords(`d="${s.d}"`))).toEqual(fromMaster);
  });

  /**
   * An Illustrator artboard is not a bounding box: the supplied compact export
   * framed 302 of artwork in 304, and the full export framed 302.3 in 302 —
   * clipping the leg of the R, which was the one shape hanging below the
   * baseline. The master now carries the measured extent and the build reads the
   * frame from there, so this asserts the one link a stale
   * `npm run build:brand` would break.
   */
  it("frames both lockups on the master's viewBox", () => {
    expect(frame.minX).toBe(0);
    expect(frame.minY).toBe(0);
    expect(ART.full.width).toBe(frame.width);
    expect(ART.full.height).toBe(frame.height);
    // One shared height is what keeps the baseline still when a responsive
    // surface swaps the full lockup for the monogram at a fixed height.
    expect(ART.compact.height).toBe(ART.full.height);
  });

  it("uses the master's own colours", () => {
    expect(master.toUpperCase()).toContain(BRAND_ORANGE.toUpperCase());
    expect(master.toUpperCase()).toContain(INK.toUpperCase());
  });

  it("keeps the compact lockup a subset of the full one", () => {
    const full = new Set(ART.full.shapes.map((s) => s.d));
    for (const s of ART.compact.shapes) expect(full.has(s.d)).toBe(true);
  });

  it("has exactly one orange shape in each lockup — the O", () => {
    expect(ART.compact.shapes.filter((s) => s.orange)).toHaveLength(1);
    expect(ART.full.shapes.filter((s) => s.orange)).toHaveLength(1);
  });

  it("declares a legible minimum height for both lockups", () => {
    for (const variant of ["full", "compact"] as const) {
      expect(ART[variant].minHeight).toBeGreaterThan(0);
      expect(ART[variant].width).toBeGreaterThan(0);
      expect(ART[variant].height).toBeGreaterThan(0);
    }
    // The compact lockup is the narrow one — that is the whole reason it exists.
    expect(ART.compact.width).toBeLessThan(ART.full.width);
  });
});
