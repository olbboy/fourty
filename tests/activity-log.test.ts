import { describe, expect, it } from "vitest";
import { activityLogInput, taskInput } from "@/lib/validators";

describe("activityLogInput", () => {
  it("accepts a touchpoint on a company, deal, or custom-object apiName", () => {
    for (const entityType of ["company", "deal", "project"]) {
      const parsed = activityLogInput.parse({ type: "call", entityType, entityId: "rec_1" });
      expect(parsed.entityType).toBe(entityType);
    }
  });
});

describe("taskInput", () => {
  it("pins a task to a custom-object apiName the same way notes do", () => {
    const parsed = taskInput.parse({ title: "Ship it", entityType: "project", entityId: "rec_1" });
    expect(parsed.entityType).toBe("project");
    expect(parsed.entityId).toBe("rec_1");
  });
});
