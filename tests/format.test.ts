import { describe, expect, it } from "vitest";
import { displayName, formatDate, timeAgo } from "@/lib/format";

describe("displayName", () => {
  it("joins present parts", () => {
    expect(displayName("Ada", "Lovelace")).toBe("Ada Lovelace");
  });

  it("skips omitted parts instead of spelling undefined", () => {
    expect(displayName(undefined, "Lovelace")).toBe("Lovelace");
    expect(displayName("Ada", undefined)).toBe("Ada");
    expect(displayName(undefined, undefined)).toBe("—");
    expect(displayName(null, "")).toBe("—");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-06-15T12:00:00Z");

  it("falls back to a dash when there is no timestamp", () => {
    expect(timeAgo(null, "en", now)).toBe("—");
    expect(timeAgo(undefined, "vi", now)).toBe("—");
  });

  it("keeps English compact relative forms", () => {
    expect(timeAgo(now - 10_000, "en", now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, "en", now)).toBe("5m ago");
    expect(timeAgo(now + 3 * 60_000, "en", now)).toBe("in 3m");
    expect(timeAgo(now - 2 * 60 * 60_000, "en", now)).toBe("2h ago");
    expect(timeAgo(now - 3 * 24 * 60 * 60_000, "en", now)).toBe("3d ago");
  });

  it("translates Vietnamese relative forms", () => {
    expect(timeAgo(now - 10_000, "vi", now)).toBe("vừa xong");
    expect(timeAgo(now - 5 * 60_000, "vi", now)).toBe("5 phút trước");
    expect(timeAgo(now + 3 * 60_000, "vi", now)).toBe("sau 3 phút");
    expect(timeAgo(now - 2 * 60 * 60_000, "vi", now)).toBe("2 giờ trước");
  });
});

describe("formatDate", () => {
  const noonUtc = Date.UTC(2026, 0, 15, 12);

  it("falls back to a dash when there is no timestamp", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined, "vi")).toBe("—");
  });

  it("keeps the English short-month form", () => {
    expect(formatDate(noonUtc, "en")).toBe("Jan 15, 2026");
  });

  it("uses the Vietnamese short-month form", () => {
    expect(formatDate(noonUtc, "vi")).toBe("15 thg 1, 2026");
  });
});
