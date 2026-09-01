import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Actor names on the audit log come from GET /api/members. A failed GET used
 * to become `{ members: [] }`, so every person rendered as a raw user id.
 */
describe("audit log members", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../src/app/(app)/settings/sections/audit-log.tsx"),
    "utf8",
  );

  it("does not swallow a failed members GET as an empty actor map", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{ members: \[\] \}/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("setMembersFailed");
    expect(src).toContain("compact");
  });
});
