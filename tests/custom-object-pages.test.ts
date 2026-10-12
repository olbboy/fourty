import { describe, expect, it } from "vitest";
import { formatFieldValue, recordTitle } from "@/app/(app)/objects/[apiName]/shared";
import type { CustomObjectFieldDef } from "@/lib/types";

const field = (over: Partial<CustomObjectFieldDef> & Pick<CustomObjectFieldDef, "key" | "label" | "type">): CustomObjectFieldDef => ({
  id: over.id ?? over.key,
  objectId: "obj",
  options: [],
  required: 0,
  order: 0,
  ...over,
});

describe("custom object record display", () => {
  it("titles a record from the first text field", () => {
    const fields = [
      field({ key: "stage", label: "Stage", type: "select" }),
      field({ key: "title", label: "Title", type: "text" }),
    ];
    expect(recordTitle({ stage: "todo", title: "Ship v2" }, fields)).toBe("Ship v2");
    expect(recordTitle({}, fields)).toBe("Untitled");
    expect(recordTitle({}, fields, "Không tiêu đề")).toBe("Không tiêu đề");
  });

  it("formats checkbox, date, and blank values for the table", () => {
    expect(formatFieldValue(field({ key: "done", label: "Done", type: "checkbox" }), true)).toBe("Yes");
    expect(formatFieldValue(field({ key: "done", label: "Done", type: "checkbox" }), false)).toBe("No");
    expect(formatFieldValue(field({ key: "done", label: "Done", type: "checkbox" }), true, { yes: "Có" })).toBe("Có");
    expect(formatFieldValue(field({ key: "due", label: "Due", type: "date" }), Date.UTC(2026, 0, 15))).toMatch(/Jan/);
    expect(formatFieldValue(field({ key: "title", label: "Title", type: "text" }), "")).toBe("—");
  });
});
