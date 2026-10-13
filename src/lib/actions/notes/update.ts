import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { notePatch } from "@/lib/validators";
import { defineAction } from "../define";
import { auditMeta, changeableNote, notePreview, noteTimelineLine, type Note } from "./shared";

export const notesUpdate = defineAction({
  name: "notes.update",
  object: "notes",
  verb: "update",
  description: "Correct a note's text by id. Only its author or an admin may; the note is marked edited.",
  input: notePatch,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, body }, ctx): Promise<Note> => {
    const note = await changeableNote(id, ctx);
    const line = await noteTimelineLine(note);
    await db.update(tables.notes).set({ body, editedAt: Date.now() }).where(eq(tables.notes.id, id));
    if (line) {
      await db
        .update(tables.activities)
        .set({ meta: JSON.stringify({ preview: notePreview(body), noteId: id }) })
        .where(eq(tables.activities.id, line));
    }
    return (await db.select().from(tables.notes).where(eq(tables.notes.id, id)).limit(1))[0]!;
  },
  effects: {
    audit: (_i, row, ctx) => ({ key: "note.updated", objectType: "note", objectId: row.id, meta: auditMeta(ctx) }),
  },
});
