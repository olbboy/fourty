import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 18 (D9): the command palette finds a contact by phone number however
 * it is written, and finds a record by what its notes say. MCP search keeps
 * its exact-or-prefix rule, which also covers phone numbers.
 */
describe("search by phone and in notes", () => {
  const KEY = "frty_search_phone";
  const ids = { khoi: "", fiesta: "", deal: "" };
  let ws: string;

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const create = async (path: string, body: Record<string, unknown>) => {
    const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
    const res = await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
    return Object.values((await res.json()) as Record<string, { id: string }>)[0]!.id;
  };
  const palette = async (q: string) => {
    const route = await import("@/app/api/search/route");
    const body = await (await route.GET(req(`/api/search?q=${encodeURIComponent(q)}`))).json();
    return body.results as { type: string; id: string; title: string; subtitle: string | null }[];
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: sha256(KEY), role: "admin", createdAt: Date.now() }),
    );
    ids.khoi = await create("contacts", { firstName: "Khôi", lastName: "Đỗ", phone: "+84 903.123.456" });
    ids.fiesta = await create("companies", { name: "Fiesta Resort" });
    ids.deal = await create("deals", { name: "Pin cho nhà hàng" });
    await create("notes", { entityType: "company", entityId: ids.fiesta, body: "Khảo sát mái nhà kho xong, chờ bản vẽ điện." });
  });

  it("finds a contact by phone written with or without spaces, dots, or the country code", async () => {
    for (const q of ["0903 123 456", "0903123456", "903.123", "+84903123456"]) {
      expect((await palette(q)).map((r) => r.id), q).toContain(ids.khoi);
    }
    expect((await palette("0911 222 333")).map((r) => r.id)).not.toContain(ids.khoi);
  });

  it("finds a record by what its notes say, showing the words that matched", async () => {
    const hits = await palette("bản vẽ điện");
    const hit = hits.find((r) => r.id === ids.fiesta);
    expect(hit).toMatchObject({ type: "company", title: "Fiesta Resort" });
    expect(hit?.subtitle).toContain("bản vẽ điện");
  });

  it("keeps MCP search to exact or prefix: a phone prefix matches, words inside a note do not", async () => {
    const { searchCrm } = await import("@/lib/services/search");
    const { withWorkspace } = await import("@/db");
    const prefix = await withWorkspace(ws, () => searchCrm("0903 12", { mode: "prefix", limit: 10, role: "admin" }));
    expect(prefix.contacts.map((c) => c.id)).toContain(ids.khoi);
    const inside = await withWorkspace(ws, () => searchCrm("123 456", { mode: "prefix", limit: 10, role: "admin" }));
    expect(inside.contacts.map((c) => c.id)).not.toContain(ids.khoi);
    const note = await withWorkspace(ws, () => searchCrm("bản vẽ", { mode: "prefix", limit: 10, role: "admin" }));
    expect(note.companies).toEqual([]);
  });
});
