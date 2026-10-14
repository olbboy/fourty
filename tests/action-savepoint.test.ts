import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * An action is all or nothing: what it wrote before refusing is undone, even
 * though the request's transaction carries on (and commits) to answer the
 * refusal. Bulk changes and nested actions rely on this.
 */
describe("an action that refuses after writing", () => {
  let ws: string;

  beforeAll(async () => {
    await resetDb();
    ws = await createWorkspace();
  });

  it("leaves nothing behind, and the transaction around it goes on", async () => {
    const { db, tables, withWorkspace } = await import("@/db");
    const { defineAction } = await import("@/lib/actions/define");
    const { execute } = await import("@/lib/actions/execute");
    const { ActionError } = await import("@/lib/actions/types");
    const { newId } = await import("@/lib/id");
    const writesThenRefuses = defineAction({
      name: "test.writesThenRefuses",
      object: "tasks",
      verb: "create",
      description: "test only",
      input: z.object({ title: z.string() }),
      expose: {},
      run: async ({ title }) => {
        await db.insert(tables.tasks).values({ id: newId(), title, createdAt: Date.now() });
        throw new ActionError("invalid", "refused after writing");
      },
    });

    await withWorkspace(ws, async () => {
      await expect(execute(writesThenRefuses, { title: "half done" }, { workspaceId: ws, role: "admin", userId: null })).rejects.toThrow(
        "refused after writing",
      );
      expect(await db.select().from(tables.tasks).where(eq(tables.tasks.title, "half done"))).toEqual([]);
      await db.insert(tables.tasks).values({ id: newId(), title: "after", createdAt: Date.now() });
    });
    const after = await withWorkspace(ws, () => db.select().from(tables.tasks).where(eq(tables.tasks.title, "after")));
    expect(after).toHaveLength(1);
  });
});
