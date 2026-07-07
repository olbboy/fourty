import { describe, it, expect } from "vitest";
import { can } from "@/lib/permissions";

/** Pure RBAC matrix (Gate B3). The route-level enforcement is in rbac-matrix.test.ts. */
describe("permissions.can", () => {
  it("admin can do everything", () => {
    for (const obj of ["contacts", "api-keys", "members", "settings", "audit"]) {
      for (const act of ["read", "create", "update", "delete"] as const) {
        expect(can("admin", obj, act), `admin ${act} ${obj}`).toBe(true);
      }
    }
  });

  it("member reads+writes CRM objects, never administration", () => {
    for (const act of ["read", "create", "update", "delete"] as const) {
      expect(can("member", "contacts", act), `member ${act} contacts`).toBe(true);
    }
    for (const obj of ["api-keys", "members", "settings", "audit"]) {
      expect(can("member", obj, "read"), `member read ${obj}`).toBe(false);
      expect(can("member", obj, "create"), `member create ${obj}`).toBe(false);
    }
  });

  it("viewer reads CRM objects but cannot write", () => {
    expect(can("viewer", "contacts", "read")).toBe(true);
    expect(can("viewer", "deals", "read")).toBe(true);
    for (const act of ["create", "update", "delete"] as const) {
      expect(can("viewer", "contacts", act), `viewer ${act} contacts`).toBe(false);
    }
    expect(can("viewer", "members", "read")).toBe(false);
  });

  it("unknown roles and objects default to deny", () => {
    expect(can("stranger", "contacts", "read")).toBe(false);
    expect(can("member", "nonexistent-object", "read")).toBe(false);
  });
});
