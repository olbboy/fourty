import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatCustomObjectError, isSafeHttpUrl, recordTitle } from "@/lib/custom-object-display";

describe("formatCustomObjectError", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known custom-object API errors", () => {
    expect(formatCustomObjectError("Object not found", en, "settings.failedCreateObject")).toBe(
      "Object not found",
    );
    expect(formatCustomObjectError("Field not found", vi, "settings.failedDeleteField")).toBe(
      "Không tìm thấy trường",
    );
    expect(
      formatCustomObjectError("That api name is reserved by a built-in object", vi, "settings.failedCreateObject"),
    ).toBe("Tên API này đã dành cho đối tượng có sẵn");
    expect(
      formatCustomObjectError(
        "Can't change this field — an existing record would be invalid: Link must be a valid http(s) URL",
        en,
        "settings.failedSaveField",
      ),
    ).toBe(
      "Can't change this field — an existing record would be invalid: Link must be a valid http(s) URL",
    );
    expect(
      formatCustomObjectError(
        "Can't change this field — an existing record would be invalid: Owner is required",
        vi,
        "settings.failedSaveField",
      ),
    ).toBe("Không đổi được trường — bản ghi hiện có sẽ không hợp lệ: Owner is required");
  });

  it("falls back to the caller's generic message for unknown errors", () => {
    expect(formatCustomObjectError("something exploded", en, "settings.failedSaveField")).toBe(
      "Failed to save field",
    );
    expect(formatCustomObjectError(undefined, vi, "settings.failedAddField")).toBe("Không thêm được trường");
  });
});

describe("recordTitle", () => {
  it("prefers the first text field, then the first field, then Untitled", () => {
    expect(recordTitle({ name: "Orion", budget: 3 }, [{ key: "name", type: "text" }, { key: "budget", type: "number" }])).toBe(
      "Orion",
    );
    expect(recordTitle({ budget: 3 }, [{ key: "budget", type: "number" }])).toBe("3");
    expect(recordTitle({ name: "" }, [{ key: "name", type: "text" }])).toBe("Untitled");
    expect(recordTitle({}, [])).toBe("Untitled");
  });
});

describe("isSafeHttpUrl", () => {
  it("allows http(s) and rejects javascript: and relative values", () => {
    expect(isSafeHttpUrl("https://example.com/x")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("/objects/ticket/1")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
});
