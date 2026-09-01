import { describe, expect, it } from "vitest";
import {
  FIELD_CHANGE_INVALID_RE,
  defsWithNewField,
  fieldChangeInvalidMessage,
  patchedFieldDefs,
} from "@/lib/field-def-guard";
import type { FieldDef } from "@/lib/records";

const website: FieldDef = {
  key: "website",
  label: "Website",
  type: "text",
  options: [],
  required: false,
};
const tier: FieldDef = {
  key: "tier",
  label: "Tier",
  type: "select",
  options: ["a", "b"],
  required: false,
};

describe("field-def-guard", () => {
  it("builds the 409 message the i18n mapper recognises", () => {
    const msg = fieldChangeInvalidMessage("Website must be a valid http(s) URL");
    expect(msg).toMatch(FIELD_CHANGE_INVALID_RE);
    expect(FIELD_CHANGE_INVALID_RE.exec(msg)?.[1]).toBe("Website must be a valid http(s) URL");
  });

  it("patches one field by key and leaves siblings alone", () => {
    expect(patchedFieldDefs([website, tier], "website", { type: "url", required: true })).toEqual([
      { ...website, type: "url", required: true },
      tier,
    ]);
  });

  it("appends a newly required field for the create-time check", () => {
    const next: FieldDef = { key: "owner", label: "Owner", type: "text", options: [], required: true };
    expect(defsWithNewField([website], next)).toEqual([website, next]);
  });
});
