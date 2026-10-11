import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv, toSpreadsheetCsv } from "@/lib/csv";

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

  it("keeps raw output unchanged for spreadsheet-looking strings", () => {
    expect(toCsv(["value"], [["=1+1"]])).toBe("value\r\n=1+1\r\n");
  });
});

describe("toSpreadsheetCsv", () => {
  it("adds a BOM and neutralizes formula prefixes after leading whitespace", () => {
    const values = [
      "=1+1",
      "+1",
      "-1",
      "@cmd",
      "\t=1",
      "\r=1",
      "\n=1",
      "＝1",
      "＋1",
      "－1",
      "＠1",
      "  =1",
      "\u00a0+1",
      'quote, "and"',
    ];
    const csv = toSpreadsheetCsv(["value"], values.map((value) => [value]));

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(parseCsv(csv).slice(1).map((row) => row[0])).toEqual(
      values.map((value) => (/^\s*[=+\-@＝＋－＠\t\r\n]/u.test(value) ? `'${value}` : value)),
    );
  });

  it("keeps numbers numeric text, including negative values", () => {
    const csv = toSpreadsheetCsv(["amount"], [[-12], [0], [12.5]]);
    expect(parseCsv(csv)).toEqual([
      ["amount"],
      ["-12"],
      ["0"],
      ["12.5"],
    ]);
    expect(csv).not.toContain("'-12");
  });

  it("retains RFC quoting for safe values containing delimiters and newlines", () => {
    const csv = toSpreadsheetCsv(["name", "note"], [["Doe, Jane", 'line one\nline "two"']]);
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'line one\nline "two"'],
    ]);
  });
});
