import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatActivityDetail, formatOwnerChange } from "@/lib/activity-display";

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
