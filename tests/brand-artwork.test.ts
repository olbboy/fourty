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

describe("brand artwork stays in step with the master", () => {
  const compact = shapesInGroup("compact");
  const lettering = shapesInGroup("lettering");

  it("carries every shape the master draws", () => {
    expect(ART.compact.shapes).toHaveLength(compact.length);
    expect(ART.full.shapes).toHaveLength(compact.length + lettering.length);
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
