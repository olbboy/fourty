import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Integration: workflow engine + lead scoring against real Postgres, inside a
 * workspace RLS context (withWorkspace).
 */
describe("workflow engine + scoring integration", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let dispatchEvent: typeof import("@/lib/workflows/engine").dispatchEvent;
  let recomputeContactScore: typeof import("@/lib/services/contact-score").recomputeContactScore;
  let newId: typeof import("@/lib/id").newId;
  let ws: string;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ dispatchEvent } = await import("@/lib/workflows/engine"));
    ({ recomputeContactScore } = await import("@/lib/services/contact-score"));
    ({ newId } = await import("@/lib/id"));
    ws = await createWorkspace();
  });

  it("fires matching workflows and skips non-matching ones", async () => {
    await withWorkspace(ws, async () => {
      const now = Date.now();
      await db.insert(tables.workflows).values({
        id: "wf1",
        name: "Task for new leads",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: JSON.stringify([{ field: "status", op: "eq", value: "lead" }]),
        actions: JSON.stringify([
          { type: "create_task", title: "Call {{firstName}}", priority: "high", dueInDays: 1 },
        ]),
        createdAt: now,
      });

      await dispatchEvent({
        event: "contact.created",
        entityType: "contact",
        entityId: "c0",
        snapshot: { firstName: "Zoe", status: "customer" },
      });
      await dispatchEvent({
        event: "contact.created",
        entityType: "contact",
        entityId: "c1",
        snapshot: { firstName: "Ada", status: "lead" },
      });

      const tasks = await db.select().from(tables.tasks);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Call Ada");
      expect(tasks[0].priority).toBe("high");
      expect(tasks[0].entityId).toBe("c1");

      const runs = await db.select().from(tables.workflowRuns);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
    });
  });

  it("disabled workflows never fire", async () => {
    await withWorkspace(ws, async () => {
      const before = (await db.select().from(tables.tasks)).length;
      await db.insert(tables.workflows).values({
        id: "wf2",
        name: "Disabled",
        enabled: 0,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "create_task", title: "Nope" }]),
        createdAt: Date.now(),
      });
      await dispatchEvent({
        event: "contact.created",
        entityType: "contact",
        entityId: "c2",
        snapshot: { status: "lead" },
      });
      const titles = (await db.select().from(tables.tasks)).map((t) => t.title);
      expect(titles).not.toContain("Nope");
      expect((await db.select().from(tables.tasks)).length).toBe(before + 1);
    });
  });

  it("renders closedAt as a calendar date in a won-deal note", async () => {
    await withWorkspace(ws, async () => {
      await db.insert(tables.workflows).values({
        id: "wf-won-date",
        name: "Won date note",
        enabled: 1,
        trigger: JSON.stringify({ event: "deal.won" }),
        conditions: "[]",
        actions: JSON.stringify([
          { type: "add_note", body: "Won on {{closedAt}} for {{amount}} {{currency}}" },
        ]),
        createdAt: Date.now(),
      });
      await dispatchEvent({
        event: "deal.won",
        entityType: "deal",
        entityId: "deal-won-date",
        snapshot: {
          name: "Acme",
          amount: 48000,
          currency: "USD",
          closedAt: Date.UTC(2026, 7, 31),
        },
      });
      const notes = (await db.select().from(tables.notes)).filter((n) => n.entityId === "deal-won-date");
      expect(notes).toHaveLength(1);
      expect(notes[0].body).toBe("Won on 2026-08-31 for 48000 USD");
    });
  });

  it("recomputes contact scores from db state", async () => {
    await withWorkspace(ws, async () => {
      const now = Date.now();
      await db.insert(tables.contacts).values({
        id: "score1",
        firstName: "Test",
        lastName: "User",
        email: "t@x.co",
        phone: "+1",
        jobTitle: "CTO",
        companyId: "comp1",
        status: "qualified",
        source: "referral",
        custom: "{}",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(tables.activities).values({
        id: newId(),
        type: "call",
        entityType: "contact",
        entityId: "score1",
        meta: "{}",
        createdAt: now - 3600_000,
      });

      const score = await recomputeContactScore("score1");
      expect(score).toBeGreaterThanOrEqual(60);
      const row = (await db.select().from(tables.contacts)).find((c) => c.id === "score1")!;
      expect(row.score).toBe(score);
      expect(row.lastActivityAt).toBe(now - 3600_000);
    });
  });

  it("update_field writes allowed columns and skips a forbidden one", async () => {
    await withWorkspace(ws, async () => {
      const now = Date.now();
      const id = newId();
      await db.insert(tables.contacts).values({
        id,
        firstName: "Zoe",
        lastName: "Lead",
        status: "lead",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(tables.workflows).values({
        id: "wf-update-field",
        name: "Qualify lead",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([
          { type: "update_field", field: "status", value: "qualified" },
          { type: "update_field", field: "jobTitle", value: "{{firstName}} Ops" },
          { type: "update_field", field: "score", value: 99 },
        ]),
        createdAt: now,
      });
      await dispatchEvent({
        event: "contact.created",
        entityType: "contact",
        entityId: id,
        snapshot: { firstName: "Zoe", status: "lead" },
      });

      const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)))[0];
      expect(row.status).toBe("qualified");
      expect(row.jobTitle).toBe("Zoe Ops");
      expect(row.score).not.toBe(99);

      const run = (await db.select().from(tables.workflowRuns).where(eq(tables.workflowRuns.workflowId, "wf-update-field")))[0];
      expect(JSON.parse(run.log)).toEqual([
        "set status = qualified",
        "set jobTitle = Zoe Ops",
        'skipped update_field: field "score" not allowed',
      ]);
    });
  });
});
