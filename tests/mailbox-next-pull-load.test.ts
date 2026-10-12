import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A failed /api/agent-tasks GET used to `return` per mailbox, so a 403/500
 * looked like "nothing is booked". The row now flags pullFailed and renders
 * LoadError compact with retry instead of omitting the next-pull line.
 */
describe("mailbox next-pull load", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../src/app/(app)/settings/sections/mailbox.tsx"),
    "utf8",
  );

  it("does not swallow a failed agent-tasks GET as no schedule", () => {
    expect(src).not.toMatch(/if \(!r\.ok\) return;/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("pullFailed");
    expect(src).toContain("LoadError");
    expect(src).toContain("compact");
  });
});
