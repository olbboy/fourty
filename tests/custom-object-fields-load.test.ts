import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A failed custom-object fields GET used to become `[]`, so a 500 hid the
 * schema on the settings list and every records/detail page. Settings now
 * flags the object; record pages throw and reuse the page LoadError.
 */
function src(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

describe("custom object fields load", () => {
  it("does not swallow a failed fields GET as an empty schema in settings", () => {
    const settings = src("src/app/(app)/settings/sections/custom-objects.tsx");
    expect(settings).not.toMatch(/if \(!r\.ok\) return \[obj\.id, \[\]/);
    expect(settings).toContain("if (!r.ok) throw");
    expect(settings).toContain("fieldsFailed");
    expect(settings).toContain("LoadError");
    expect(settings).toContain("compact");
  });

  it("does not swallow a failed fields GET on records and detail pages", () => {
    const list = src("src/app/(app)/objects/[apiName]/records-client.tsx");
    const detail = src("src/app/(app)/objects/[apiName]/[id]/record-detail.tsx");
    expect(list).not.toMatch(/if \(fieldsRes\.ok\) setFields/);
    expect(detail).not.toMatch(/if \(fieldsRes\.ok\) setFields/);
    expect(list).toContain('if (!fieldsRes.ok) throw');
    expect(detail).toContain('if (!fieldsRes.ok) throw');
  });
});
