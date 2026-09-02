import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { searchCrm } from "@/lib/services/search";

/**
 * Custom-object search used to ILIKE the raw JSON text then prefix-filter in
 * JS after LIMIT — so `q=title` hit every row, and a true prefix match older
 * than 25 infix rows disappeared.
 */
describe("searchCrm custom-object records", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let ws: string;
  let orionId: string;
  let underscoreId: string;
  let emptyId: string;
  let datedId: string;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    const objectId = newId();
    orionId = newId();
    underscoreId = newId();
    emptyId = newId();
    datedId = newId();
    const now = Date.now();
    await withWorkspace(ws, async () => {
      await db.insert(tables.customObjects).values({
        id: objectId,
        apiName: "searchable",
        nameSingular: "Searchable",
        namePlural: "Searchables",
        createdAt: now,
      });
      await db.insert(tables.customObjectFields).values([
        {
          id: newId(),
          objectId,
          key: "title",
          label: "Title",
          type: "text",
          required: 0,
          order: 0,
          createdAt: now,
        },
        {
          id: newId(),
          objectId,
          key: "due",
          label: "Due",
          type: "date",
          required: 0,
          order: 1,
          createdAt: now,
        },
      ]);
      const noise = Array.from({ length: 30 }, (_, i) => ({
        id: newId(),
        objectId,
        data: JSON.stringify({ title: `Noise ${i}` }),
        createdAt: now + i,
        updatedAt: now + i,
      }));
      await db.insert(tables.customRecords).values([
        ...noise,
        {
          id: orionId,
          objectId,
          data: JSON.stringify({ title: "Orion Ticket" }),
          createdAt: now - 10_000,
          updatedAt: now - 10_000,
        },
        {
          id: underscoreId,
          objectId,
          data: JSON.stringify({ title: "foo_bar" }),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: emptyId,
          objectId,
          data: JSON.stringify({ title: "" }),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: datedId,
          objectId,
          data: JSON.stringify({ title: "Dated", due: Date.UTC(2024, 0, 15) }),
          createdAt: now,
          updatedAt: now,
        },
      ]);
    });
  });

  it("prefix-matches a value even when many newer rows share the JSON key", async () => {
    const hits = await withWorkspace(ws, () =>
      searchCrm("Ori", { mode: "prefix", limit: 10, role: "admin" }),
    );
    expect(hits.records.some((r) => r.id === orionId)).toBe(true);
    expect(hits.records.every((r) => r.title.toLowerCase().startsWith("ori"))).toBe(true);
  });

  it("does not treat the JSON key name as a hit", async () => {
    const prefix = await withWorkspace(ws, () =>
      searchCrm("title", { mode: "prefix", limit: 25, role: "admin" }),
    );
    expect(prefix.records).toEqual([]);
    const contains = await withWorkspace(ws, () =>
      searchCrm("title", { mode: "contains", limit: 25, role: "admin" }),
    );
    expect(contains.records).toEqual([]);
  });

  it("does not match the Untitled fallback on an empty title", async () => {
    const hits = await withWorkspace(ws, () =>
      searchCrm("Un", { mode: "prefix", limit: 25, role: "admin" }),
    );
    expect(hits.records.some((r) => r.id === emptyId)).toBe(false);
  });

  it("treats underscore as a literal in the term", async () => {
    const hits = await withWorkspace(ws, () =>
      searchCrm("foo_bar", { mode: "prefix", limit: 10, role: "admin" }),
    );
    expect(hits.records.some((r) => r.id === underscoreId)).toBe(true);
  });

  it("does not prefix-match a date millis or other non-string JSON value", async () => {
    const hits = await withWorkspace(ws, () =>
      searchCrm("1", { mode: "prefix", limit: 25, role: "admin" }),
    );
    expect(hits.records.some((r) => r.id === datedId)).toBe(false);
  });

  it("returns no custom hits for a wildcard-only query", async () => {
    const hits = await withWorkspace(ws, () =>
      searchCrm("%", { mode: "contains", limit: 10, role: "admin" }),
    );
    expect(hits.records).toEqual([]);
    expect(hits.contacts).toEqual([]);
  });
});
