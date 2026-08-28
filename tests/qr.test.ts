import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { qrMatrix, qrPathD } from "@/lib/qr";
import { otpauthUri, generateSecret } from "@/lib/totp";

/**
 * The QR encoder backs 2FA enrollment — an unscannable code there bricks the
 * feature politely, so this suite pins the output two independent ways:
 *
 * 1. **Cross-implementation fixtures.** tests/fixtures/qr-vectors.json holds
 *    matrices produced by the python `qrcode` package (byte mode, level M) for
 *    three payload sizes (versions 1, 3 and 8 — the last exercising multi-block
 *    interleaving and the version-info blocks) with every mask 0–7 forced.
 *    Our matrices must match bit-for-bit. Auto-mask entries (mask: -1) are
 *    excluded from strict equality: both mask choices are spec-legal, and the
 *    forced-mask vectors already prove every mask's matrix is correct.
 *
 * 2. **Structural invariants** on the real otpauth payload the app renders,
 *    independent of any reference implementation.
 */

type Vector = { payload: string; mask: number; version: number; size: number; rows: string[] };
const vectors: Vector[] = JSON.parse(
  readFileSync(path.resolve(__dirname, "fixtures/qr-vectors.json"), "utf8"),
);

function toRows(matrix: boolean[][]): string[] {
  return matrix.map((row) => row.map((c) => (c ? "1" : "0")).join(""));
}

describe("qr encoder matches the reference implementation", () => {
  for (const v of vectors.filter((v) => v.mask >= 0)) {
    it(`payload ${v.payload.length}B (version ${v.version}), mask ${v.mask}`, () => {
      const matrix = qrMatrix(v.payload, { mask: v.mask });
      expect(matrix.length).toBe(v.size);
      expect(toRows(matrix)).toEqual(v.rows);
    });
  }

  it("auto mask picks the same version as the reference", () => {
    for (const v of vectors.filter((v) => v.mask === -1)) {
      expect(qrMatrix(v.payload).length).toBe(v.size);
    }
  });
});

describe("qr structural invariants (real otpauth payload)", () => {
  const uri = otpauthUri(generateSecret(), "user@example.com");
  const m = qrMatrix(uri);
  const size = m.length;

  it("is square with a valid version size", () => {
    expect((size - 17) % 4).toBe(0);
    for (const row of m) expect(row.length).toBe(size);
  });

  it("has the three finder patterns with light separators", () => {
    // Finder centres: ring of 7 dark/light/dark; probe a few defining cells.
    for (const [cx, cy] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ]) {
      expect(m[cy][cx]).toBe(true); // centre dark
      expect(m[cy - 2][cx]).toBe(false); // inner light ring
      expect(m[cy - 3][cx]).toBe(true); // outer dark ring
    }
    expect(m[7][7]).toBe(false); // separator corner
  });

  it("has alternating timing patterns on row/column 6", () => {
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it("has the fixed dark module", () => {
    expect(m[size - 8][8]).toBe(true);
  });

  it("rejects payloads beyond version 10", () => {
    expect(() => qrMatrix("x".repeat(300))).toThrow(/too long/);
  });

  it("qrPathD draws exactly the dark modules", () => {
    const d = qrPathD(m);
    const darkCount = m.flat().filter(Boolean).length;
    expect(d.match(/M\d+ \d+h1v1h-1z/g)?.length).toBe(darkCount);
  });
});
