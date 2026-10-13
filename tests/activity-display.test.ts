import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatActivityDetail, formatOwnerChange, formatValueChanges } from "@/lib/activity-display";

describe("formatActivityDetail", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known system details", () => {
    expect(formatActivityDetail("Workflow added note", en)).toBe("Workflow added a note");
    expect(formatActivityDetail("Workflow added note", vi)).toBe("Workflow đã thêm ghi chú");
    expect(formatActivityDetail("AI draft", vi)).toBe("Bản nháp AI");
  });

  it("leaves unknown details unchanged", () => {
    expect(formatActivityDetail("someone typed this", en)).toBe("someone typed this");
  });
});

describe("formatOwnerChange", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("names both owners", () => {
    expect(formatOwnerChange({ from: "Ada Lovelace", to: "Grace Hopper" }, en)).toBe("changed owner: Ada Lovelace → Grace Hopper");
    expect(formatOwnerChange({ from: "DVHai", to: "LTHoa" }, vi)).toBe("đổi người phụ trách: DVHai → LTHoa");
  });

  it("shows a missing side as unassigned", () => {
    expect(formatOwnerChange({ from: null, to: "Grace Hopper" }, en)).toBe("changed owner: Unassigned → Grace Hopper");
    expect(formatOwnerChange({ from: "DVHai", to: null }, vi)).toBe("đổi người phụ trách: DVHai → Chưa gán");
  });
});

describe("formatValueChanges", () => {
  const vi = translator("vi");

  it("reads each change as label: old → new, money compact, dates in the reader's locale", () => {
    const text = formatValueChanges(
      [
        { field: "amount", from: 80e9, to: 60e9, fromCurrency: "VND", toCurrency: "VND" },
        { field: "delivery", label: "Ngày xuất dự kiến", from: Date.UTC(2027, 2, 1), to: null },
      ],
      vi,
      "vi",
    );
    // Intl keeps "tỷ" and "₫" together with a no-break space.
    expect(text).toBe("Giá trị: 80 tỷ\u00a0₫ → 60 tỷ\u00a0₫; Ngày xuất dự kiến: 1 thg 3, 2027 → —");
  });

  it("ignores meta that is not a list of changes", () => {
    expect(formatValueChanges("nope", vi, "vi")).toBe("");
  });
});
