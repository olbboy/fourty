import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A failed GET used to become `{ tasks: [], last: null }`, which the panel
 * renders as nothing — the same as a record the agent has never touched. The
 * ledger now throws on !ok and shows LoadError.
 */
describe("agent queue", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/components/agent-queue.tsx"), "utf8");

  it("does not swallow a failed GET as an empty ledger", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{ tasks: \[\], last: null \}/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("LoadError");
    expect(src).toContain("compact");
  });
});
