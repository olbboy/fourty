import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import type { ActionContext } from "@/lib/actions/types";

/**
 * Notes can be fixed or removed (Phase 7, Q76): by whoever wrote them, or by
 * an admin. The timeline line a note left follows it: an edit updates its
 * preview, a delete takes it away, so a corrected typo does not linger there.
 */
describe("editing and deleting notes", () => {
  let withWorkspace: typeof import("@/db").withWorkspace;
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let execute: typeof import("@/lib/actions/execute").execute;
  let notes: typeof import("@/lib/actions/notes");
  let activitiesList: typeof import("@/lib/actions/activities").activitiesList;
  let ws: string;
  let binh: ActionContext;
  let dai: ActionContext;
  let admin: ActionContext;
  const deal = { entityType: "deal", entityId: "deal-dienluc" };

  const as = <T>(ctx: ActionContext, fn: () => Promise<T>) => withWorkspace(ctx.workspaceId, fn);
  const write = (ctx: ActionContext, body: string) =>
    as(ctx, () => execute(notes.notesCreate, { ...deal, body }, ctx)) as Promise<{ id: string }>;
  const previews = async () => {
    const rows = (await as(admin, () => execute(activitiesList, deal, admin))) as { type: string; meta: unknown }[];
    return rows
      .filter((a) => a.type === "note_added")
      .map((a) => (typeof a.meta === "string" ? JSON.parse(a.meta) : a.meta).preview as string);
  };

  beforeAll(async () => {
    await resetDb();
    ({ withWorkspace, db, tables } = await import("@/db"));
    ({ execute } = await import("@/lib/actions/execute"));
    notes = await import("@/lib/actions/notes");
    ({ activitiesList } = await import("@/lib/actions/activities"));
    ws = await createWorkspace();
    binh = { workspaceId: ws, role: "member", userId: "user-binh" };
    dai = { workspaceId: ws, role: "member", userId: "user-dai" };
    admin = { workspaceId: ws, role: "admin", userId: "user-anhlam" };
  });

  it("lets the author fix their note, marks it edited, and updates the timeline preview", async () => {
    const note = await write(binh, "Báo giá Điện lực 800 tỷ");
    const fixed = (await as(binh, () => execute(notes.notesUpdate, { id: note.id, body: "Báo giá Điện lực 80 tỷ" }, binh))) as {
      body: string;
      editedAt: number | null;
    };
    expect(fixed.body).toBe("Báo giá Điện lực 80 tỷ");
    expect(fixed.editedAt).toEqual(expect.any(Number));
    expect(await previews()).toContain("Báo giá Điện lực 80 tỷ");
    expect(await previews()).not.toContain("Báo giá Điện lực 800 tỷ");
  });

  it("lets an admin fix someone else's note, but not another member", async () => {
    const note = await write(binh, "Hẹn khảo sát thứ 3");
    const refused = await as(dai, () => execute(notes.notesUpdate, { id: note.id, body: "x" }, dai)).catch((e) => e);
    expect(refused).toMatchObject({ kind: "forbidden" });
    await expect(as(admin, () => execute(notes.notesUpdate, { id: note.id, body: "Hẹn khảo sát thứ 4" }, admin))).resolves.toBeTruthy();
  });

  it("deletes a note and its timeline line, for the author or an admin only", async () => {
    const note = await write(binh, "Ghi nhầm deal");
    const refused = await as(dai, () => execute(notes.notesDelete, { id: note.id }, dai)).catch((e) => e);
    expect(refused).toMatchObject({ kind: "forbidden" });
    await as(binh, () => execute(notes.notesDelete, { id: note.id }, binh));
    const left = (await as(admin, () => execute(notes.notesList, deal, admin))) as { id: string }[];
    expect(left.map((n) => n.id)).not.toContain(note.id);
    expect(await previews()).not.toContain("Ghi nhầm deal");
  });

  it("tells each reader whether they may change a note", async () => {
    const note = await write(binh, "Ai sửa được?");
    const seenBy = async (ctx: ActionContext) =>
      ((await as(ctx, () => execute(notes.notesList, deal, ctx))) as { id: string; canChange: boolean }[]).find(
        (n) => n.id === note.id,
      )!.canChange;
    expect(await seenBy(binh)).toBe(true);
    expect(await seenBy(admin)).toBe(true);
    expect(await seenBy(dai)).toBe(false);
  });

  it("removes the timeline line of a note written before notes could be edited", async () => {
    // Older timeline lines carry only the preview, not the note id.
    const { newId } = await import("@/lib/id");
    const id = newId();
    await as(admin, async () => {
      await db.insert(tables.notes).values({ id, ...deal, body: "Ghi chú cũ", authorId: "user-binh", createdAt: Date.now() });
      await db.insert(tables.activities).values({
        id: newId(), ...deal, type: "note_added", actorId: "user-binh", meta: JSON.stringify({ preview: "Ghi chú cũ" }), createdAt: Date.now(),
      });
    });
    await as(admin, () => execute(notes.notesDelete, { id }, admin));
    expect(await previews()).not.toContain("Ghi chú cũ");
  });
});
