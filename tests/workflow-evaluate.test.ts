import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateConditions, renderTemplate } from "@/lib/workflows/evaluate";

const snapshot = {
  firstName: "Maya",
  status: "lead",
  score: 85,
  email: "maya@acme.io",
  city: null,
  amount: 5000,
};

describe("evaluateCondition", () => {
  it("eq is case-insensitive for strings", () => {
    expect(evaluateCondition({ field: "status", op: "eq", value: "Lead" }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: "status", op: "eq", value: "customer" }, snapshot)).toBe(false);
  });

  it("compares numbers", () => {
    expect(evaluateCondition({ field: "score", op: "gte", value: 70 }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: "score", op: "lt", value: 70 }, snapshot)).toBe(false);
    expect(evaluateCondition({ field: "amount", op: "gt", value: "4999" }, snapshot)).toBe(true);
  });

  it("handles empty checks", () => {
    expect(evaluateCondition({ field: "city", op: "is_empty" }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: "email", op: "not_empty" }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: "missing", op: "is_empty" }, snapshot)).toBe(true);
  });

  it("contains is case-insensitive", () => {
    expect(evaluateCondition({ field: "email", op: "contains", value: "ACME" }, snapshot)).toBe(true);
  });

  it("non-numeric comparison returns false rather than throwing", () => {
    expect(evaluateCondition({ field: "firstName", op: "gt", value: 5 }, snapshot)).toBe(false);
  });
});

describe("evaluateConditions", () => {
  it("requires all to match", () => {
    expect(
      evaluateConditions(
        [
          { field: "status", op: "eq", value: "lead" },
          { field: "score", op: "gte", value: 70 },
        ],
        snapshot,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        [
          { field: "status", op: "eq", value: "lead" },
          { field: "score", op: "gte", value: 99 },
        ],
        snapshot,
      ),
    ).toBe(false);
  });

  it("empty conditions always pass", () => {
    expect(evaluateConditions([], snapshot)).toBe(true);
  });
});

describe("renderTemplate", () => {
  it("substitutes placeholders", () => {
    expect(renderTemplate("Follow up with {{firstName}} ({{score}})", snapshot)).toBe(
      "Follow up with Maya (85)",
    );
  });

  it("renders missing/null values as empty", () => {
    expect(renderTemplate("City: {{city}}, X: {{nope}}", snapshot)).toBe("City: , X: ");
  });
});
