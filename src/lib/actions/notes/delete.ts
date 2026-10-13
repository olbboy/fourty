import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { deleteInput } from "../schemas";
import { auditMeta, changeableNote, notePreview, noteTimelineLine } from "./shared";

/** Either the dry run (MCP's default) or the deletion, as for the other deletes. */
type DeleteResult =
  | { dryRun: true; wouldDelete: { type: "note"; id: string; preview: string }; hint: string }
  | { deleted: true; type: "note"; id: string };

export const notesDelete = defineAction({
  name: "notes.delete",
  object: "notes",
  verb: "delete",
  description: "Delete a note by id, with its timeline line. Only its author or an admin may. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }, ctx): Promise<DeleteResult> => {
    const note = await changeableNote(id, ctx);
    if (confirm !== true) {
      return {
        dryRun: true,
        wouldDelete: { type: "note", id, preview: notePreview(note.body) },
        hint: "Re-call with confirm=true to actually delete (also removes its timeline line).",
      };
    }
    const line = await noteTimelineLine(note);
    await db.delete(tables.notes).where(eq(tables.notes.id, id));
    if (line) await db.delete(tables.activities).where(eq(tables.activities.id, line));
    return { deleted: true, type: "note", id };
  },
  effects: {
    audit: (_i, out, ctx) =>
      "deleted" in out ? { key: "note.deleted", objectType: "note", objectId: out.id, meta: auditMeta(ctx) } : null,
  },
});
