/**
 * Dependency-free CSV parse/serialize with proper quoting (RFC 4180).
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^﻿/, ""); // strip BOM

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop trailing fully-empty rows
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

function escapeField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type CsvCell = string | number | null | undefined;

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeField).join(",")];
  for (const row of rows) lines.push(row.map(escapeField).join(","));
  return lines.join("\r\n") + "\r\n";
}

/**
 * Serialize CSV for a spreadsheet import boundary.
 *
 * `toCsv` intentionally remains the raw RFC-4180 serializer used by imports and
 * round-trip callers. This variant adds the UTF-8 BOM expected by common
 * spreadsheet applications and prefixes only string cells that begin with a
 * formula-like character (including after leading whitespace). Numeric cells
 * keep their type semantics, so a negative number is emitted as `-12`, not
 * `'-12`.
 */
export function toSpreadsheetCsv(headers: string[], rows: CsvCell[][]): string {
  const safe = (value: CsvCell): CsvCell => {
    if (typeof value !== "string") return value;
    // Spreadsheet implementations differ in how they treat ASCII and
    // full-width formula prefixes. Check the first non-whitespace character,
    // including tabs and line breaks, while preserving the original value.
    return /^\s*[=+\-@＝＋－＠\t\r\n]/u.test(value) ? `'${value}` : value;
  };

  const csv = toCsv(headers.map((header) => safe(header) as string), rows.map((row) => row.map(safe)));
  return `\uFEFF${csv}`;
}
