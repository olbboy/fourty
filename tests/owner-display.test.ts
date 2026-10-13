import { describe, expect, it } from "vitest";
import { ownerLabel } from "@/lib/owner-display";
import { translator } from "@/lib/i18n";

/**
 * Whose a record is, as lists show it. A member who left keeps their name,
 * marked as gone, so their deals and tasks do not pass for unassigned ones.
 */
describe("owner label", () => {
  const people = [
    { id: "binh", name: "DVHai", active: true },
    { id: "bac", name: "BTDuc", active: false },
  ];

  it("names an active owner, marks one who left, and says when nobody owns it", () => {
    const vi = translator("vi");
    expect(ownerLabel("binh", people, vi)).toBe("DVHai");
    expect(ownerLabel("bac", people, vi)).toBe("BTDuc (đã nghỉ)");
    expect(ownerLabel(null, people, vi)).toBe("Chưa gán");
    expect(ownerLabel("bac", people, translator("en"))).toBe("BTDuc (left)");
  });

  it("falls back to the inactive-member label for an id it does not know", () => {
    expect(ownerLabel("ghost", people, translator("vi"))).toBe("Thành viên đã nghỉ");
  });
});
