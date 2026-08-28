import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/utils";

/**
 * The open-redirect guard behind /login?next=…. What matters is that every
 * known escape returns null — a miss here turns the login page into a signed
 * link to anywhere.
 */
describe("safeInternalPath", () => {
  it("passes ordinary internal paths through untouched", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/accept?token=ws1.abc%2Fdef")).toBe("/accept?token=ws1.abc%2Fdef");
  });

  it("rejects absent values", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });

  it("rejects absolute and scheme-relative URLs", () => {
    expect(safeInternalPath("https://evil.test/phish")).toBeNull();
    expect(safeInternalPath("//evil.test/phish")).toBeNull();
  });

  it("rejects backslash variants browsers would normalise off-origin", () => {
    expect(safeInternalPath("/\\evil.test")).toBeNull();
    expect(safeInternalPath("\\/evil.test")).toBeNull();
  });

  it("rejects paths that don't start at the root", () => {
    expect(safeInternalPath("dashboard")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
  });
});
