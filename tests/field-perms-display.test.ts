import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { fieldPermsRoleLabel, formatFieldPermsError } from "@/lib/field-perms-display";

describe("fieldPermsRoleLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known roles", () => {
    expect(fieldPermsRoleLabel("viewer", en)).toBe("Viewer");
    expect(fieldPermsRoleLabel("member", vi)).toBe("Thành viên");
    expect(fieldPermsRoleLabel("viewer", vi)).toBe("Người xem");
    expect(fieldPermsRoleLabel("admin", vi)).toBe("Quản trị viên");
  });

  it("leaves unknown roles unchanged", () => {
    expect(fieldPermsRoleLabel("owner", en)).toBe("owner");
  });
});

describe("formatFieldPermsError", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("maps auth failures", () => {
    expect(formatFieldPermsError("Forbidden: member cannot create field-permissions", en, "settings.fieldPermsFailedSave")).toBe(
      "You don't have permission to change field permissions",
    );
    expect(formatFieldPermsError("Unauthorized", vi, "settings.fieldPermsFailedClear")).toBe(
      "Bạn không có quyền đổi quyền theo trường",
    );
  });

  it("uses the caller fallback for anything else", () => {
    expect(formatFieldPermsError("object: Invalid enum value", en, "settings.fieldPermsFailedSave")).toBe(
      "Failed to save rule",
    );
    expect(formatFieldPermsError(undefined, vi, "settings.fieldPermsFailedClear")).toBe("Không gỡ được rule");
  });
});
