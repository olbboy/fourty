import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { fieldTypeLabel } from "@/lib/field-type-display";

describe("fieldTypeLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known field types", () => {
    expect(fieldTypeLabel("text", en)).toBe("Text");
    expect(fieldTypeLabel("number", vi)).toBe("Số");
    expect(fieldTypeLabel("select", vi)).toBe("Chọn");
    expect(fieldTypeLabel("url", en)).toBe("URL");
  });

  it("leaves unknown types unchanged", () => {
    expect(fieldTypeLabel("json", en)).toBe("json");
  });
});
