import { describe, expect, it } from "vitest";
import { canEditField, stripBlockedWrites, type ObjectFieldAccess } from "@/lib/field-access";

describe("stripBlockedWrites", () => {
  it("drops defaulted keys the role may not write", () => {
    expect(
      stripBlockedWrites({ name: "Acme", amount: 0, currency: "USD", custom: {} }, ["amount", "currency"]),
    ).toEqual({ name: "Acme", custom: {} });
  });

  it("leaves the body alone when nothing is blocked", () => {
    const body = { name: "Acme", amount: 10 };
    expect(stripBlockedWrites(body, [])).toBe(body);
  });
});

describe("canEditField", () => {
  const ready = (over: Partial<Pick<ObjectFieldAccess, "hidden" | "blockedWrites">> = {}): ObjectFieldAccess => ({
    ready: true,
    failed: false,
    hidden: over.hidden ?? new Set(),
    blockedWrites: over.blockedWrites ?? new Set(),
  });

  it("is false until the /me payload has loaded", () => {
    expect(canEditField({ ready: false, failed: false, hidden: new Set(), blockedWrites: new Set() }, "stageId")).toBe(false);
  });

  it("is false when /me failed rather than treating missing rules as allow-all", () => {
    expect(canEditField({ ready: false, failed: true, hidden: new Set(), blockedWrites: new Set() }, "stageId")).toBe(false);
  });

  it("is false when the field is hidden or write-blocked", () => {
    expect(canEditField(ready({ hidden: new Set(["stageId"]) }), "stageId")).toBe(false);
    expect(canEditField(ready({ blockedWrites: new Set(["stageId"]) }), "stageId")).toBe(false);
  });

  it("is true when the role may read and write the field", () => {
    expect(canEditField(ready(), "stageId")).toBe(true);
  });
});
