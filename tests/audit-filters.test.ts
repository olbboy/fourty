import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Phase 27 (D18): an admin narrows the audit log to one person, one kind of
 * action and a span of days, and the CSV says who acted by name and email.
 */
describe("audit log filters", () => {
  const KEY = "frty_audit_filters";
  let ws: string;
  const people = { binh: "", lan: "" };
  const day = 86_400_000;
  const now = Date.now();

  const req = (url: string) => new Request(`http://localhost${url}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const entries = async (query: string) => {
    const route = await import("@/app/api/audit/route");
    const res = await route.GET(req(`/api/audit?${query}`));
    expect(res.status).toBe(200);
    return (await res.json()).entries as { actorId: string | null; action: string; createdAt: number }[];
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const auth = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    people.binh = await auth.createUser("binh@team.test", "DVHai", "binh-password-1");
    people.lan = await auth.createUser("lan@team.test", "LTHoa", "lan-password-1");
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values({ id: newId(), workspaceId: ws, name: "admin", prefix: KEY.slice(0, 8), keyHash: auth.sha256(KEY), role: "admin", createdAt: now });
      const row = (actorId: string, action: string, createdAt: number) => ({ id: newId(), actorId, action, objectType: action.split(".")[0], objectId: "x", meta: "{}", createdAt });
      await db.insert(tables.auditLog).values([
        row(people.binh, "deal.updated", now - 1 * day),
        row(people.binh, "deal.deleted", now - 10 * day),
        row(people.binh, "contact.created", now - 2 * day),
        row(people.lan, "deal.updated", now - 1 * day),
      ]);
    });
  });

  it("narrows to one person", async () => {
    const rows = await entries(`actorId=${people.lan}`);
    expect(rows.map((r) => r.action)).toEqual(["deal.updated"]);
  });

  it("narrows to one kind of action, or a whole object's actions", async () => {
    expect((await entries("action=deal.updated")).map((r) => r.actorId).sort()).toEqual([people.binh, people.lan].sort());
    expect((await entries(`action=deal.&actorId=${people.binh}`)).map((r) => r.action)).toEqual(["deal.updated", "deal.deleted"]);
  });

  it("narrows to a span of days", async () => {
    const rows = await entries(`actorId=${people.binh}&from=${now - 5 * day}&to=${now}`);
    expect(rows.map((r) => r.action)).toEqual(["deal.updated", "contact.created"]);
  });

  it("names who acted in the CSV", async () => {
    const route = await import("@/app/api/audit/route");
    const csv = await (await route.GET(req(`/api/audit?format=csv&actorId=${people.binh}`))).text();
    const [header, first] = csv.trim().split("\n");
    expect(header).toContain("actor_name");
    expect(header).toContain("actor_email");
    expect(first).toContain("DVHai");
    expect(first).toContain("binh@team.test");
  });
});
