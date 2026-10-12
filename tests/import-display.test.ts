import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatImportError } from "@/lib/import-display";

describe("formatImportError", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known import-API errors", () => {
    expect(formatImportError("Empty file", en)).toBe("The file is empty");
    expect(formatImportError("Empty file", vi)).toBe("File trống");
    expect(formatImportError("No data rows found — is the first row a header?", vi)).toBe(
      "Không có dòng dữ liệu — hàng đầu có phải tiêu đề không?",
    );
    expect(formatImportError("Too many rows (max 5000)", en)).toBe("Too many rows (max 5000)");
    expect(formatImportError("Too many rows (max 5000)", vi)).toBe("Quá nhiều dòng (tối đa 5000)");
    expect(formatImportError("Forbidden: viewer cannot create contacts", vi)).toBe(
      "Bạn không có quyền nhập liên hệ",
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(formatImportError("something exploded", en)).toBe("Import failed");
    expect(formatImportError(undefined, vi)).toBe("Nhập thất bại");
  });
});
