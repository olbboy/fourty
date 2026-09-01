import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatActivityDetail } from "@/lib/activity-display";

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
