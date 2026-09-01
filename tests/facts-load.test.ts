import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Facts GET used to return `[]` on !ok, so a 500 looked like "the pass has no
 * opinion" on every contact/company and the agent research tab. The hook now
 * throws on !ok; callers render LoadError compact with retry.
 */
function src(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

describe("facts load", () => {
  const hook = src("src/components/fact-suggestion.tsx");

  it("does not swallow a failed GET as an empty suggestion list", () => {
    expect(hook).not.toMatch(/if \(!res\.ok\) return \[\]/);
    expect(hook).toContain("if (!res.ok) throw");
    expect(hook).toContain("setFailed");
  });

  it("surfaces a failed facts GET on record pages and the agent panel", () => {
    const contact = src("src/app/(app)/contacts/[id]/contact-detail.tsx");
    const company = src("src/app/(app)/companies/[id]/company-detail.tsx");
    const agent = src("src/components/agent-panel/index.tsx");
    expect(contact).toContain("factsFailed");
    expect(contact).toContain("LoadError");
    expect(company).toContain("factsFailed");
    expect(company).toContain("LoadError");
    expect(agent).toContain("factsFailed");
    expect(agent).toContain("failed={factsFailed}");
  });

  it("does not treat a failed PATCH as a successful decision", () => {
    expect(hook).not.toMatch(/await decide\([^)]+\);\s*setBusy\(false\);\s*onDecided\(\)/);
    expect(hook).toContain("if (!res.ok) throw");
    expect(hook).toContain("fact.failedDecide");
    expect(hook).toContain("setError");
    expect(hook).toContain('role="alert"');
  });
});
