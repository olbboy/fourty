import { describe, expect, it } from "vitest";
import { convert, formatMoney } from "@/lib/currency";

describe("convert", () => {
  it("is identity for same currency", () => {
    expect(convert(100, "USD", "USD")).toBe(100);
  });

  it("converts through USD", () => {
    const eur = convert(100, "EUR", "USD");
    expect(eur).toBeCloseTo(109, 0);
    // round-trip
    expect(convert(eur, "USD", "EUR")).toBeCloseTo(100, 6);
  });

  it("passes through unknown currencies", () => {
    expect(convert(100, "XYZ", "USD")).toBe(100);
  });

  it("handles VND scale", () => {
    expect(convert(1_000_000_000, "VND", "USD")).toBeCloseTo(39000, 0);
  });
});

describe("formatMoney", () => {
  it("formats USD (whole dollars at >= 1000)", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,235");
    expect(formatMoney(99.5, "USD")).toBe("$99.50");
  });

  it("falls back for bogus currency codes", () => {
    expect(formatMoney(10, "???")).toContain("10");
  });
});
