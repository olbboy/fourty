import { describe, expect, it } from "vitest";
import { convert, formatCompact, formatMoney, sumInReporting, toReporting } from "@/lib/currency";

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

  it("renders a missing amount as an em dash", () => {
    expect(formatMoney(undefined, "USD")).toBe("—");
    expect(formatMoney(null, "EUR")).toBe("—");
    expect(formatCompact(undefined, "USD")).toBe("—");
  });
});

describe("money in Vietnamese", () => {
  it("spells the compact unit out, the way a Vietnamese reader says it", () => {
    expect(formatCompact(293_864_000_000, "VND", "vi")).toBe("293,9 tỷ\u00a0₫");
    expect(formatCompact(850_000_000, "VND", "vi")).toBe("850 triệu\u00a0₫");
    expect(formatCompact(139_000, "USD", "vi")).toBe("139 nghìn\u00a0US$");
  });

  it("writes a full amount with Vietnamese separators", () => {
    expect(formatMoney(293_864_000_000, "VND", "vi")).toBe("293.864.000.000\u00a0₫");
  });

  it("keeps the English form for English", () => {
    expect(formatCompact(293_864_000_000, "VND", "en")).toBe("₫293.9B");
  });
});

describe("sumInReporting", () => {
  const usd = { currency: "USD", perUsd: {} };

  it("adds visible amounts in the reporting currency", () => {
    expect(
      sumInReporting(
        [
          { amount: 100, currency: "USD" },
          { amount: 100, currency: "EUR" },
        ],
        usd,
      ),
    ).toBeCloseTo(209, 0);
  });

  it("returns null when any amount is hidden", () => {
    expect(sumInReporting([{ amount: 100, currency: "USD" }, { currency: "USD" }], usd)).toBeNull();
  });

  it("returns 0 for an empty list", () => {
    expect(sumInReporting([], usd)).toBe(0);
  });
});

describe("toReporting", () => {
  it("uses the admin's rate, written per 1 USD, over the built-in one", () => {
    const vnd = { currency: "VND", perUsd: { VND: 25_000 } };
    expect(toReporting(100, "USD", vnd)).toBeCloseTo(2_500_000, 6);
    expect(toReporting(1_000_000, "VND", vnd)).toBeCloseTo(1_000_000, 6);
  });
});
