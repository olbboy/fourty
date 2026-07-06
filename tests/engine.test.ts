import { beforeAll, describe, expect, it } from "vitest";

process.env.FOURTY_DB_PATH = ":memory:";

/**
 * Integration: workflow engine + lead scoring against a real (in-memory) SQLite db.
 */
describe("workflow engine + scoring integration", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let dispatchEvent: typeof import("@/lib/workflows/engine").dispatchEvent;
  let recomputeContactScore: typeof import("@/lib/services/contact-score").recomputeContactScore;
  let newId: typeof import("@/lib/id").newId;

  beforeAll(async () => {
    ({ db, tables } = await import("@/db"));
    ({ dispatchEvent } = await import("@/lib/workflows/engine"));
    ({ recomputeContactScore } = await import("@/lib/services/contact-score"));
    ({ newId } = await import("@/lib/id"));
  });

  it("fires matching workflows and skips non-matching ones", () => {
    const now = Date.now();
    db.insert(tables.workflows)
      .values({
        id: "wf1",
        name: "Task for new leads",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: JSON.stringify([{ field: "status", op: "eq", value: "lead" }]),
        actions: JSON.stringify([
          { type: "create_task", title: "Call {{firstName}}", priority: "high", dueInDays: 1 },
        ]),
        createdAt: now,
      })
      .run();

    // Non-matching: status customer
    dispatchEvent({
      event: "contact.created",
      entityType: "contact",
      entityId: "c0",
      snapshot: { firstName: "Zoe", status: "customer" },
    });
    // Matching
    dispatchEvent({
      event: "contact.created",
      entityType: "contact",
      entityId: "c1",
      snapshot: { firstName: "Ada", status: "lead" },
    });

    const tasks = db.select().from(tables.tasks).all();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Call Ada");
    expect(tasks[0].priority).toBe("high");
    expect(tasks[0].entityId).toBe("c1");

    const runs = db.select().from(tables.workflowRuns).all();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
  });

  it("disabled workflows never fire", () => {
    const before = db.select().from(tables.tasks).all().length;
    db.insert(tables.workflows)
      .values({
        id: "wf2",
        name: "Disabled",
        enabled: 0,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "create_task", title: "Nope" }]),
        createdAt: Date.now(),
      })
      .run();
    dispatchEvent({
      event: "contact.created",
      entityType: "contact",
      entityId: "c2",
      snapshot: { status: "lead" },
    });
    // wf1 fires (matching), wf2 must not
    const titles = db.select().from(tables.tasks).all().map((t) => t.title);
    expect(titles).not.toContain("Nope");
    expect(db.select().from(tables.tasks).all().length).toBe(before + 1);
  });

  it("recomputes contact scores from db state", () => {
    const now = Date.now();
    db.insert(tables.contacts)
      .values({
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
      })
      .run();
    db.insert(tables.activities)
      .values({
        id: newId(),
        type: "call",
        entityType: "contact",
        entityId: "score1",
        meta: "{}",
        createdAt: now - 3600_000,
      })
      .run();

    const score = recomputeContactScore("score1");
    expect(score).toBeGreaterThanOrEqual(60);
    const row = db.select().from(tables.contacts).all().find((c) => c.id === "score1")!;
    expect(row.score).toBe(score);
    expect(row.lastActivityAt).toBe(now - 3600_000);
  });
});
