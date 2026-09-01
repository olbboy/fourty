import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { t } from "@/lib/i18n";

/**
 * Diagnostics PATCH used to ignore !ok on the about line (and revert the
 * research switch with no message), so a 403/500 looked like a successful save.
 * Writes now surface a catalog error with role=alert.
 */
describe("diagnostics PATCH", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../src/app/(app)/settings/sections/diagnostics.tsx"),
    "utf8",
  );

  it("does not swallow a failed about save", () => {
    expect(src).not.toMatch(/if \(res\.ok\) setSaved/);
    expect(src).toContain("if (!res.ok)");
    expect(src).toContain("settings.diagnosticsFailedSave");
    expect(src).toContain("setError");
    expect(src).toContain('role="alert"');
  });

  it("does not swallow a failed research toggle as a silent revert", () => {
    expect(src).toContain("settings.diagnosticsFailedResearch");
    expect(src).toContain("setResearch(!next)");
    expect(src).toContain("setError");
  });

  it("catalogues the write-failure copy in both locales", () => {
    expect(t("en", "settings.diagnosticsFailedSave")).toBe("Failed to save workspace description");
    expect(t("vi", "settings.diagnosticsFailedSave")).toBe("Không lưu được mô tả workspace");
    expect(t("en", "settings.diagnosticsFailedResearch")).toBe("Failed to update mailbox research");
    expect(t("vi", "settings.diagnosticsFailedResearch")).toBe("Không cập nhật được cài đặt đọc hộp thư");
  });
});
