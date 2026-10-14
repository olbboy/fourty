import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 23 (D14): deals come in from a spreadsheet. A dry run shows each row
 * as it would be stored, with what is wrong; the real import takes every row
 * or none. Tasks and notes go out as CSV like contacts, companies and deals.
 */
describe("importing deals, exporting tasks and notes", () => {
  const KEY = "frty_import_deals";
  let ws: string;
  let lanId = "";
  const stages: Record<string, string> = {};

  const req = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "content-type": "text/csv" } });
  const json = (url: string, body: Record<string, unknown>) =>
    new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" } });
  const importDeals = async (csv: string, dryRun: boolean) => {
    const route = await import("@/app/api/import/deals/route");
    return route.POST(req(`/api/import/deals${dryRun ? "?dryRun=1" : ""}`, { method: "POST", body: csv }));
  };
  const deals = async () => {
    const route = await import("@/app/api/deals/route");
    return (await (await route.GET(req("/api/deals"))).json()).deals as Record<string, unknown>[];
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: auth.sha256(KEY), role: "admin", createdAt: Date.now() }),
    );
    lanId = await auth.createUser("lthoa@team.test", "LTHoa", "lan-password-1");
    await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: ws, userId: lanId, role: "member", createdAt: Date.now() });
    const contacts = await import("@/app/api/contacts/route");
    await contacts.POST(json("/api/contacts", { firstName: "Khôi", lastName: "Đỗ", email: "khoi@khach.test" }));
    const pipelines = await import("@/app/api/pipelines/route");
    const list = (await (await pipelines.GET(req("/api/pipelines"))).json()).pipelines[0].stages as { id: string; name: string }[];
    for (const s of list) stages[s.name] = s.id;
  });

  const header = "Tên deal,Giá trị,Tiền tệ,Giai đoạn,Ngày dự kiến ký,Người phụ trách,Công ty,Liên hệ";

  it("previews every row without writing anything, and says what is wrong with a row", async () => {
    const [first, second] = Object.keys(stages);
    const csv = [
      header,
      `Fiesta,"20.000.000.000",VND,${first},2026-12-15,lthoa@team.test,Fiesta Resort,khoi@khach.test`,
      `Sai,1000,VND,Không có giai đoạn này,,,,`,
      `Vạn Cát,"5,000",USD,${second},31/12/2026,,,`,
    ].join("\n");
    const res = await importDeals(csv, true);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(3);
    expect(body.rows[0]).toMatchObject({ line: 2, name: "Fiesta", amount: 20_000_000_000, currency: "VND", stage: first, owner: "LTHoa", company: "Fiesta Resort", newCompany: true });
    expect(body.rows[1].error).toMatch(/stage/i);
    expect(body.rows[2]).toMatchObject({ amount: 5000, currency: "USD" });
    expect(body).toMatchObject({ valid: 2, invalid: 1 });
    expect(await deals()).toEqual([]);
  });

  it("flags in the preview a row the import itself would refuse", async () => {
    const res = await importDeals([header, `${"Dài".repeat(100)},1,VND,,,,,`].join("\n"), true);
    const body = await res.json();
    expect(body.rows[0].error).toMatch(/name/);
    expect(body).toMatchObject({ valid: 0, invalid: 1 });
  });

  it("imports nothing while one row is wrong", async () => {
    const csv = [header, `Một,1,VND,,,,,`, `Hai,2,VND,,,không-ai@đâu.test,,`].join("\n");
    const res = await importDeals(csv, false);
    expect(res.status).toBe(400);
    expect(await deals()).toEqual([]);
  });

  it("imports every row: stage, owner, amount, close date, a new company and a known contact", async () => {
    const [first] = Object.keys(stages);
    const csv = [header, `Fiesta,"20.000.000.000",VND,${first},2026-12-15,lthoa@team.test,Fiesta Resort,khoi@khach.test`, `Bán lẻ,"1.500.000",VND,,15/01/2027,,,`].join("\n");
    const res = await importDeals(csv, false);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 2, companiesCreated: 1 });
    const fiesta = (await deals()).find((d) => d.name === "Fiesta")!;
    expect(fiesta).toMatchObject({ amount: 20_000_000_000, currency: "VND", stageId: stages[first!], ownerId: lanId });
    expect(new Date(fiesta.expectedCloseDate as number).toISOString().slice(0, 10)).toBe("2026-12-15");
    expect(fiesta.contactId).not.toBeNull();
    expect(fiesta.companyId).not.toBeNull();
    const retail = (await deals()).find((d) => d.name === "Bán lẻ")!;
    expect(new Date(retail.expectedCloseDate as number).toISOString().slice(0, 10)).toBe("2027-01-15");
  });

  it("exports tasks and notes as CSV, naming the record each belongs to", async () => {
    const fiesta = (await deals()).find((d) => d.name === "Fiesta")!;
    const tasks = await import("@/app/api/tasks/route");
    await tasks.POST(json("/api/tasks", { title: "Gửi hồ sơ năng lực", entityType: "deal", entityId: fiesta.id }));
    const notes = await import("@/app/api/notes/route");
    await notes.POST(json("/api/notes", { entityType: "deal", entityId: fiesta.id, body: "Khách muốn giao trước Tết" }));

    const route = await import("@/app/api/export/[entity]/route");
    const get = async (entity: string) => {
      const res = await route.GET(req(`/api/export/${entity}`), { params: Promise.resolve({ entity }) });
      expect(res.status).toBe(200);
      return res.text();
    };
    const taskCsv = await get("tasks");
    expect(taskCsv).toContain("Gửi hồ sơ năng lực");
    expect(taskCsv).toContain("Fiesta");
    const noteCsv = await get("notes");
    expect(noteCsv).toContain("Khách muốn giao trước Tết");
    expect(noteCsv).toContain("Fiesta");
  });

  it("takes back the rows already written when a later row is refused", async () => {
    // Members may not set a deal's amount here: the second row is refused only
    // once the first deal and its new company are already written.
    const MEMBER = "frty_import_member";
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "member", prefix: MEMBER.slice(0, 8), keyHash: auth.sha256(MEMBER), role: "member", createdAt: Date.now() }),
    );
    const perms = await import("@/app/api/field-permissions/route");
    const set = await perms.POST(json("/api/field-permissions", { object: "deals", field: "amount", role: "member", canRead: true, canWrite: false }));
    expect(set.status).toBeLessThan(300);

    const route = await import("@/app/api/import/deals/route");
    const csv = [header, `Trước,,VND,,,,Công ty Rollback,`, `Sau,"1.000.000",VND,,,,,`].join("\n");
    const res = await route.POST(
      new Request("http://localhost/api/import/deals", { method: "POST", body: csv, headers: { Authorization: `Bearer ${MEMBER}`, "content-type": "text/csv" } }),
    );
    expect(res.status).toBe(403);
    expect((await deals()).map((d) => d.name)).not.toContain("Trước");
    const companies = await import("@/app/api/companies/route");
    const list = (await (await companies.GET(req("/api/companies"))).json()).companies as { name: string }[];
    expect(list.map((c) => c.name)).not.toContain("Công ty Rollback");
  });
});
