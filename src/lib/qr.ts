/**
 * QR Code encoder (ISO/IEC 18004 Model 2) — byte mode, error-correction level M,
 * versions 1–10, dependency-free. Exists so 2FA enrollment can show a scannable
 * otpauth:// QR without adding a runtime package (the same trade the TOTP and
 * OIDC primitives already made on node:crypto).
 *
 * The module layout (finders, timing, alignment, format/version bits, zigzag
 * codeword placement, masks) follows the spec's reference construction. It is
 * verified bit-for-bit against an independent implementation across payload
 * sizes and all eight masks in tests/qr.test.ts — change anything here and that
 * fixture is the net.
 *
 * Pure: no crypto, no DOM, no clock. Runs in the browser (the settings page
 * renders the matrix as SVG) and under vitest.
 */

export type QrMatrix = boolean[][]; // [row][col], true = dark module

// ── GF(256) arithmetic for Reed-Solomon (primitive polynomial 0x11D) ────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Reed-Solomon remainder: `data` × x^degree mod the degree-`degree` generator. */
function rsRemainder(data: number[], degree: number): number[] {
  // Generator polynomial ∏(x − α^i), i = 0..degree−1. The product loop builds
  // coefficients lowest-degree-first; the long division below indexes them
  // highest-degree-first, so reverse once here.
  const gen = [1];
  for (let i = 0; i < degree; i++) {
    gen.push(0);
    for (let j = gen.length - 1; j > 0; j--) gen[j] = gen[j - 1] ^ gfMul(gen[j], GF_EXP[i]);
    gen[0] = gfMul(gen[0], GF_EXP[i]);
  }
  gen.reverse();
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ── Version tables (level M only — the one level this app emits) ────────────

// [ecCodewordsPerBlock, [blockCount, dataCodewordsPerBlock][]] for v1..v10.
const EC_M: ReadonlyArray<readonly [number, ReadonlyArray<readonly [number, number]>]> = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];

// Leftover bits after interleaved codewords, per version 1..10.
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

// Alignment-pattern centre coordinates per version 1..10 (both axes).
const ALIGNMENT: ReadonlyArray<ReadonlyArray<number>> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function dataCodewords(version: number): number {
  const [, groups] = EC_M[version - 1];
  return groups.reduce((sum, [count, per]) => sum + count * per, 0);
}

/** Smallest version whose byte-mode capacity fits `byteLen`, or null beyond v10. */
function fitVersion(byteLen: number): number | null {
  for (let v = 1; v <= 10; v++) {
    const cci = v <= 9 ? 8 : 16; // byte-mode char-count indicator width
    if (4 + cci + 8 * byteLen <= dataCodewords(v) * 8) return v;
  }
  return null;
}

// ── Bit assembly ────────────────────────────────────────────────────────────

function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const capacityBits = dataCodewords(version) * 8;
  const bits: number[] = [];
  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  // Terminator (up to 4 zero bits), then pad to a byte boundary.
  push(0, Math.min(4, capacityBits - bits.length));
  if (bits.length % 8 !== 0) push(0, 8 - (bits.length % 8));
  // Alternating pad codewords to fill the data capacity.
  const pads = [0xec, 0x11];
  for (let i = 0; bits.length < capacityBits; i++) push(pads[i % 2], 8);

  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
    words.push(w);
  }
  return words;
}

/** Split into EC blocks, compute Reed-Solomon per block, interleave. */
function interleave(words: number[], version: number): number[] {
  const [ecPerBlock, groups] = EC_M[version - 1];
  const dataBlocks: number[][] = [];
  let offset = 0;
  for (const [count, per] of groups) {
    for (let b = 0; b < count; b++) {
      dataBlocks.push(words.slice(offset, offset + per));
      offset += per;
    }
  }
  const ecBlocks = dataBlocks.map((block) => rsRemainder(block, ecPerBlock));
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

// ── Matrix construction ─────────────────────────────────────────────────────

type Grid = { size: number; dark: boolean[][]; func: boolean[][] };

function setFunc(g: Grid, col: number, row: number, isDark: boolean): void {
  g.dark[row][col] = isDark;
  g.func[row][col] = true;
}

function drawFinder(g: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const col = cx + dx;
      const row = cy + dy;
      if (col < 0 || col >= g.size || row < 0 || row >= g.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev ring
      setFunc(g, col, row, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(g: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunc(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** Format bits: 5 data bits (level M = 00, then mask) + BCH(15,5), XOR-masked. */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // level M's two format bits are 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >> i) & 1) === 1;
  // Copy around the top-left finder.
  for (let i = 0; i <= 5; i++) setFunc(g, 8, i, bit(i));
  setFunc(g, 8, 7, bit(6));
  setFunc(g, 8, 8, bit(7));
  setFunc(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunc(g, 14 - i, 8, bit(i));
  // Second copy split across the other two finders.
  for (let i = 0; i <= 7; i++) setFunc(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunc(g, 8, g.size - 15 + i, bit(i));
  setFunc(g, 8, g.size - 8, true); // dark module
}

/** Version bits (v ≥ 7): 6 data bits + BCH(18,6), in the two 3×6 blocks. */
function drawVersion(g: Grid, version: number): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const isDark = ((bits >> i) & 1) === 1;
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunc(g, a, b, isDark);
    setFunc(g, b, a, isDark);
  }
}

function drawFunctionPatterns(g: Grid, version: number): void {
  // Timing patterns.
  for (let i = 0; i < g.size; i++) {
    setFunc(g, 6, i, i % 2 === 0);
    setFunc(g, i, 6, i % 2 === 0);
  }
  // Finders (drawn after timing so their separators win the shared cells).
  drawFinder(g, 3, 3);
  drawFinder(g, g.size - 4, 3);
  drawFinder(g, 3, g.size - 4);
  // Alignment patterns — skip the three that would overlap a finder.
  const centres = ALIGNMENT[version - 1];
  for (const cx of centres) {
    for (const cy of centres) {
      const nearFinder =
        (cx <= 8 && cy <= 8) || (cx >= g.size - 9 && cy <= 8) || (cx <= 8 && cy >= g.size - 9);
      if (!nearFinder) drawAlignment(g, cx, cy);
    }
  }
  drawFormat(g, 0); // reserve the format areas before codeword placement
  drawVersion(g, version);
}

/** Zigzag codeword placement over the non-function modules. */
function drawCodewords(g: Grid, codewords: number[]): void {
  let i = 0;
  const total = codewords.length * 8;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped whole
    for (let vert = 0; vert < g.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? g.size - 1 - vert : vert;
        if (!g.func[row][col] && i < total) {
          g.dark[row][col] = ((codewords[i >> 3] >> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

/** XOR the mask pattern over every non-function module (self-inverse). */
function applyMask(g: Grid, mask: number): void {
  for (let row = 0; row < g.size; row++) {
    for (let col = 0; col < g.size; col++) {
      if (g.func[row][col]) continue;
      let invert: boolean;
      switch (mask) {
        case 0: invert = (row + col) % 2 === 0; break;
        case 1: invert = row % 2 === 0; break;
        case 2: invert = col % 3 === 0; break;
        case 3: invert = (row + col) % 3 === 0; break;
        case 4: invert = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
        case 5: invert = ((row * col) % 2) + ((row * col) % 3) === 0; break;
        case 6: invert = (((row * col) % 2) + ((row * col) % 3)) % 2 === 0; break;
        default: invert = (((row + col) % 2) + ((row * col) % 3)) % 2 === 0; break;
      }
      if (invert) g.dark[row][col] = !g.dark[row][col];
    }
  }
}

/** The spec's four penalty rules — lower is better. */
function penalty(g: Grid): number {
  const n = g.size;
  let score = 0;
  // Rule 1: runs of ≥5 same-coloured modules in a row/column.
  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      let prev = axis === 0 ? g.dark[a][0] : g.dark[0][a];
      for (let b = 1; b < n; b++) {
        const cur = axis === 0 ? g.dark[a][b] : g.dark[b][a];
        if (cur === prev) {
          run++;
          if (b === n - 1 && run >= 5) score += 3 + (run - 5);
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
          prev = cur;
        }
      }
    }
  }
  // Rule 2: 2×2 blocks of a single colour.
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const c = g.dark[row][col];
      if (c === g.dark[row][col + 1] && c === g.dark[row + 1][col] && c === g.dark[row + 1][col + 1]) {
        score += 3;
      }
    }
  }
  // Rule 3: finder-like 1011101 with 0000 on either side, in rows and columns.
  const finderAt = (get: (i: number) => boolean, i: number, max: number): boolean => {
    const core = [true, false, true, true, true, false, true];
    if (i + 6 >= max) return false;
    for (let k = 0; k < 7; k++) if (get(i + k) !== core[k]) return false;
    const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !get(i - k));
    const lightAfter = i + 10 < max && [7, 8, 9, 10].every((k) => !get(i + k));
    return lightBefore || lightAfter;
  };
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (finderAt((i) => g.dark[a][i], b, n)) score += 40;
      if (finderAt((i) => g.dark[i][a], b, n)) score += 40;
    }
  }
  // Rule 4: dark-module proportion, 10 points per 5% step away from 50%.
  let dark = 0;
  for (const row of g.dark) for (const cell of row) if (cell) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Encode `text` (UTF-8, byte mode, level M) into a module matrix.
 * `opts.mask` pins a mask 0–7 (used by the cross-implementation tests);
 * left unset, the best mask by penalty score is chosen per the spec.
 * Throws when the payload exceeds version 10 (~213 bytes) — the otpauth URIs
 * this app renders are less than half that.
 */
export function qrMatrix(text: string, opts?: { mask?: number }): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = fitVersion(bytes.length);
  if (version === null) throw new Error(`QR payload too long (${bytes.length} bytes > version 10)`);
  const size = 17 + 4 * version;
  const g: Grid = {
    size,
    dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    func: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
  drawFunctionPatterns(g, version);
  const codewords = interleave(buildCodewords(bytes, version), version);
  // Sanity: interleaved stream must fill the symbol exactly (minus remainder bits).
  let free = 0;
  for (const row of g.func) for (const cell of row) if (!cell) free++;
  if (codewords.length * 8 + REMAINDER_BITS[version - 1] !== free) {
    throw new Error("QR internal error: codeword count does not match symbol capacity");
  }
  drawCodewords(g, codewords);

  if (opts?.mask !== undefined) {
    applyMask(g, opts.mask);
    drawFormat(g, opts.mask);
    return g.dark;
  }
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(g, mask);
    drawFormat(g, mask);
    const score = penalty(g);
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
    applyMask(g, mask); // undo (XOR is self-inverse; format is redrawn next pass)
  }
  applyMask(g, best);
  drawFormat(g, best);
  return g.dark;
}

/**
 * One SVG path drawing every dark module at 1 unit per module — render with
 * `viewBox="0 0 ${size} ${size}"` and `shape-rendering="crispEdges"`. A single
 * path keeps the DOM at one node instead of a few thousand rects.
 */
export function qrPathD(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (matrix[row][col]) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }
  return parts.join("");
}
