import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * First-boot sample data must look like a working CRM. Deals created through
 * the API are scored; the seed path has to do the same or the kanban/list
 * HealthBadge never renders on demo deals.
 */
describe("seedDemoData", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let ws: string;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    const { createUser } = await import("@/lib/auth");
    const { seedDemoData } = await import("@/db/seed");
    ws = await createWorkspace();
    await createUser("seed@fourty.test", "Seed User", "password12");
    await withWorkspace(ws, () => seedDemoData());
  });

  it("gives every demo deal a computed health score (won=100, not the 0 default)", async () => {
    const deals = await withWorkspace(ws, async () => {
      const rows = await db.select().from(tables.deals);
      const stages = await db.select().from(tables.stages);
      const typeById = new Map(stages.map((s) => [s.id, s.type]));
      return rows.map((d) => ({ ...d, stageType: typeById.get(d.stageId) }));
    });
    expect(deals.length).toBeGreaterThan(0);
    const won = deals.filter((d) => d.stageType === "won");
    const lost = deals.filter((d) => d.stageType === "lost");
    expect(won.length).toBeGreaterThan(0);
    expect(lost.length).toBeGreaterThan(0);
    for (const d of won) expect(d.score, d.name).toBe(100);
    for (const d of lost) expect(d.score, d.name).toBe(0);
    const open = deals.filter((d) => d.stageType === "open");
    expect(open.some((d) => d.score !== 0)).toBe(true);
  });
});
