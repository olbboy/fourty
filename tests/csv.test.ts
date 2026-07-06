import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const rows = parseCsv('name,note\n"Doe, Jane","She said ""hi""\nsecond line"');
    expect(rows[1][0]).toBe("Doe, Jane");
    expect(rows[1][1]).toBe('She said "hi"\nsecond line');
  });

  it("handles CRLF and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")[0][0]).toBe("a");
  });

  it("drops fully empty rows", () => {
    expect(parseCsv("a,b\n\n1,2\n,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvObjects", () => {
  it("maps headers to values", () => {
    expect(parseCsvObjects("name,email\nJane,j@x.co")).toEqual([
      { name: "Jane", email: "j@x.co" },
    ]);
  });

  it("returns empty for header-only input", () => {
    expect(parseCsvObjects("name,email")).toEqual([]);
  });
});

describe("toCsv", () => {
  it("escapes special characters and round-trips", () => {
    const csv = toCsv(["name", "note"], [['Doe, Jane', 'quote " here'], ["Bob", null]]);
    const parsed = parseCsv(csv);
    expect(parsed[1]).toEqual(["Doe, Jane", 'quote " here']);
    expect(parsed[2]).toEqual(["Bob", ""]);
  });
});
