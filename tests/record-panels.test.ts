import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Timeline / notes / tasks used to treat a failed GET as an empty list, so a
 * 500 looked like "no activity yet" with no way to retry. The panels now throw
 * on !ok and render LoadError.
 */
describe("record panels", () => {
  const src = readFileSync(path.resolve(__dirname, "../src/components/record-panels.tsx"), "utf8");

  it("does not swallow a failed GET as an empty list", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{ (activities|notes|tasks): \[\] \}/);
    expect(src).toContain("if (!res.ok) throw");
    expect(src).toContain("LoadError");
    expect(src).toContain("compact");
  });

  it("does not clear a note or task draft after a failed write", () => {
    const failBranches = [...src.matchAll(/if \(!res\.ok\) \{[^}]+\}/g)].map((m) => m[0]);
    expect(failBranches.length).toBeGreaterThan(0);
    for (const branch of failBranches) expect(branch).not.toContain("setDraft");
  });

  it("surfaces a failed write instead of staying silent", () => {
    expect(src).toContain("activity.failedWrite");
    expect(src).toContain("setError");
    expect(src).toContain('role="alert"');
  });

  it("assigns a task with ownerId the same way the tasks page does", () => {
    expect(src).toContain("/api/tasks/assignees");
    expect(src).toContain("ownerId");
    expect(src).toContain("field.assignee");
  });
});
