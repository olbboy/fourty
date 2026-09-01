import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { roleLabel } from "@/lib/role-display";

describe("roleLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates workspace roles", () => {
    expect(roleLabel("admin", en)).toBe("Admin");
    expect(roleLabel("member", en)).toBe("Member");
    expect(roleLabel("viewer", en)).toBe("Viewer");
    expect(roleLabel("admin", vi)).toBe("Quản trị viên");
    expect(roleLabel("member", vi)).toBe("Thành viên");
    expect(roleLabel("viewer", vi)).toBe("Người xem");
  });

  it("leaves unknown roles unchanged", () => {
    expect(roleLabel("owner", en)).toBe("owner");
  });
});
