import { beforeAll, describe, expect, it } from "vitest";
import { createWorkspace, resetDb } from "./pg-setup";
import { PINNED_TASK_LIMIT, pinnedWorkIds } from "@/lib/pinned-tasks";

describe("pinnedWorkIds (Postgres + RLS)", () => {
  let ws: string;
  let emptyId: string;
  let busyId: string;

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
    emptyId = newId();
    busyId = newId();
    const now = Date.now();
    await withWorkspace(ws, async () => {
      await db.insert(tables.contacts).values([
        { id: emptyId, firstName: "Empty", createdAt: now, updatedAt: now },
        { id: busyId, firstName: "Busy", createdAt: now, updatedAt: now },
      ]);
    });
  });

  it("returns empty arrays when nothing is pinned", async () => {
    const { withWorkspace } = await import("@/db");
    const ids = await withWorkspace(ws, () => pinnedWorkIds("contact", emptyId));
    expect(ids).toEqual({ taskIds: [], noteIds: [], activityIds: [] });
  });

  it("keeps the newest 25 activity ids, not the oldest", async () => {
    const { db, tables, withWorkspace } = await import("@/db");
    const { newId } = await import("@/lib/id");
    const base = Date.now();
    const inserted: { id: string; createdAt: number }[] = [];
    for (let i = 0; i < PINNED_TASK_LIMIT + 1; i++) {
      inserted.push({ id: newId(), createdAt: base + i });
    }
    await withWorkspace(ws, async () => {
      await db.insert(tables.activities).values(
        inserted.map((row) => ({
          id: row.id,
          type: "call",
          entityType: "contact",
          entityId: busyId,
          createdAt: row.createdAt,
        })),
      );
    });

    const ids = await withWorkspace(ws, () => pinnedWorkIds("contact", busyId));
    const newest = inserted
      .slice(1)
      .map((r) => r.id)
      .reverse();
    expect(ids.activityIds).toHaveLength(PINNED_TASK_LIMIT);
    expect(ids.activityIds).toEqual(newest);
    expect(ids.activityIds).not.toContain(inserted[0].id);
    expect(ids.noteIds).toEqual([]);
    expect(ids.taskIds).toEqual([]);
  });
});
