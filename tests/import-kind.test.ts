import { describe, expect, it } from "vitest";
import { looksLikeDeals } from "@/lib/import-deals";

/**
 * Q102: a deals file dropped on the contacts import skips every row and looks
 * done. The page asks first when the file has no column a contact's name
 * comes from, and has a deal's name or value.
 */
describe("looksLikeDeals", () => {
  it("knows a deals file, as written in Vietnamese or English", () => {
    expect(looksLikeDeals(["Tên deal", "Giá trị", "Tiền tệ", "Công ty", "Người phụ trách", "Loại hình bán"])).toBe(true);
    expect(looksLikeDeals(["Deal name", "Amount", "Currency"])).toBe(true);
    expect(looksLikeDeals(["Giá trị", "Công ty"])).toBe(true);
  });

  it("leaves alone a file the contacts import can read a name from", () => {
    expect(looksLikeDeals(["name", "email", "title", "company"])).toBe(false);
    expect(looksLikeDeals(["First Name", "Last Name", "Amount"])).toBe(false);
    expect(looksLikeDeals(["full_name", "deal"])).toBe(false);
  });

  it("leaves alone a file that says nothing about deals", () => {
    expect(looksLikeDeals(["foo", "bar"])).toBe(false);
    expect(looksLikeDeals([])).toBe(false);
  });
});
