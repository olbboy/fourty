import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatRunLogLine } from "@/lib/workflows/run-log";

describe("formatRunLogLine", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known engine lines and interpolates values", () => {
    expect(formatRunLogLine('created task "Call Ada"', en)).toBe("Created task “Call Ada”");
    expect(formatRunLogLine('created task "Call Ada"', vi)).toBe("Đã tạo việc “Call Ada”");
    expect(formatRunLogLine("added note", vi)).toBe("Đã thêm ghi chú");
    expect(formatRunLogLine("set status = customer", en)).toBe("Set status = customer");
    expect(formatRunLogLine("webhook queued → https://hooks.example.com/x", en)).toBe(
      "Webhook queued → https://hooks.example.com/x",
    );
    expect(formatRunLogLine('skipped update_field: field "score" not allowed', en)).toBe(
      "Skipped field update: “score” is not allowed",
    );
    expect(formatRunLogLine("error: boom", vi)).toBe("Lỗi: boom");
  });

  it("leaves custom log-action text unchanged", () => {
    expect(formatRunLogLine("Follow up with Maya", en)).toBe("Follow up with Maya");
    expect(formatRunLogLine("Follow up with Maya", vi)).toBe("Follow up with Maya");
  });
});
