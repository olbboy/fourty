import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { __setMailer, type MailMessage } from "@/lib/mail";

/**
 * The morning reminder end to end (Phase 9): an admin turns it on with a time
 * zone; from 8:00 there, the worker's tick sends each owner one email a day.
 */
describe("morning reminder dispatch", () => {
  const ADMIN_KEY = "frty_reminders_admin";
  const VIEWER_KEY = "frty_reminders_viewer";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let dispatchReminders: typeof import("@/lib/services/reminders").dispatchReminders;
  let settings: typeof import("@/app/api/settings/reminders/route");
  let ws: string;
  let sent: MailMessage[] = [];

  const req = (key: string, method: string, body?: unknown) =>
    new Request("http://localhost/api/settings/reminders", {
      method,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  /** One worker tick for the workspace, at a given moment, as the worker runs it. */
  const tickAt = async (when: number) => {
    vi.setSystemTime(when);
    await withWorkspace(ws, () => dispatchReminders(ws));
  };
  const capture = { transport: "smtp:test", from: "crm@team.test", send: async (m: MailMessage) => void sent.push(m) };
  const vnTime = (h: number, m = 0) => Date.UTC(2026, 9, 14, h - 7, m); // 14/10/2026 in Hanoi
  const day = (d: number) => Date.UTC(2026, 9, d, 5); // local noon in Hanoi

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(vnTime(7));
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ({ dispatchReminders } = await import("@/lib/services/reminders"));
    settings = await import("@/app/api/settings/reminders/route");
    ws = await createWorkspace();
    const binh = newId();
    const dai = newId();
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values([
        { id: newId(), workspaceId: ws, name: "admin", prefix: ADMIN_KEY.slice(0, 8), keyHash: sha256(ADMIN_KEY), role: "admin", createdAt: Date.now() },
        { id: newId(), workspaceId: ws, name: "viewer", prefix: VIEWER_KEY.slice(0, 8), keyHash: sha256(VIEWER_KEY), role: "viewer", createdAt: Date.now() },
      ]);
      await db.insert(tables.users).values([
        { id: binh, email: "binh@team.test", name: "DVHai", passwordHash: "s:h", role: "member", createdAt: Date.now() },
        { id: dai, email: "dai@team.test", name: "NVLong", passwordHash: "s:h", role: "member", createdAt: Date.now() },
      ]);
      await db.insert(tables.tasks).values([
        { id: newId(), title: "Hỏi tình trạng Điện lực Vùng 1", ownerId: binh, dueDate: day(14), priority: "high", createdAt: Date.now() },
        { id: newId(), title: "Gửi báo giá Fiesta", ownerId: binh, dueDate: day(10), priority: "medium", createdAt: Date.now() },
        { id: newId(), title: "Khảo sát Vạn Cát", ownerId: dai, dueDate: day(12), priority: "medium", createdAt: Date.now() },
        { id: newId(), title: "Họp tuần sau", ownerId: dai, dueDate: day(21), priority: "low", createdAt: Date.now() },
      ]);
    });
  });

  afterEach(() => __setMailer(undefined));
  afterAll(() => vi.useRealTimers());

  it("lets an admin turn it on with a time zone, remembering where the app is", async () => {
    expect((await settings.PATCH(req(VIEWER_KEY, "PATCH", { enabled: true }))).status).toBe(403);
    expect((await settings.PATCH(req(ADMIN_KEY, "PATCH", { timeZone: "Mars/Olympus" }))).status).toBe(400);
    const res = await settings.PATCH(req(ADMIN_KEY, "PATCH", { enabled: true, timeZone: "Asia/Ho_Chi_Minh", locale: "vi" }));
    expect(res.status).toBe(200);
    expect(await (await settings.GET(req(ADMIN_KEY, "GET"))).json()).toEqual({
      enabled: true,
      timeZone: "Asia/Ho_Chi_Minh",
      locale: "vi",
      appUrl: "http://localhost",
    });
  });

  it("sends nothing before 8 in the morning, or while mail is not set up", async () => {
    __setMailer(capture);
    await tickAt(vnTime(7, 59));
    __setMailer(null);
    await tickAt(vnTime(8, 5));
    expect(sent).toEqual([]);
  });

  it("from 8:00 sends each owner one email with today's and overdue tasks, once a day", async () => {
    __setMailer(capture);
    await tickAt(vnTime(8, 30));
    await tickAt(vnTime(8, 31));
    await tickAt(vnTime(10, 0));
    expect(sent.map((m) => m.to).sort()).toEqual(["binh@team.test", "dai@team.test"]);
    const binh = sent.find((m) => m.to === "binh@team.test")!;
    expect(binh.subject).toBe("Việc của bạn hôm nay: 1 đến hạn, 1 quá hạn");
    expect(binh.text).toContain("Hỏi tình trạng Điện lực Vùng 1");
    expect(binh.text).toContain("Gửi báo giá Fiesta");
    expect(binh.text).toContain("http://localhost/tasks");
    expect(sent.find((m) => m.to === "dai@team.test")!.text).not.toContain("Họp tuần sau");
  });

  it("sends nothing while reminders are off", async () => {
    sent = [];
    await settings.PATCH(req(ADMIN_KEY, "PATCH", { enabled: false }));
    __setMailer(capture);
    vi.setSystemTime(vnTime(8, 30) + 86_400_000);
    await tickAt(vnTime(8, 30) + 86_400_000);
    expect(sent).toEqual([]);
  });
});
