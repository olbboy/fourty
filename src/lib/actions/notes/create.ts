import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { noteInput } from "@/lib/validators";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { auditMeta, type Note } from "./shared";

export const notesCreate = defineAction({
  name: "notes.create",
  object: "notes",
  verb: "create",
  description: "Add a note to a contact, company, deal, or custom-object record (entityType is the object apiName).",
  input: noteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Note> => {
    const id = newId();
    await db.insert(tables.notes).values({
      id,
      ...data,
      authorId: ctx.userId,
      createdAt: Date.now(),
    });
    return (await db.select().from(tables.notes).where(eq(tables.notes.id, id)).limit(1))[0]!;
  },
  effects: {
    activity: (_i, row, ctx) => ({
      type: "note_added",
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: ctx.userId,
      meta: { preview: row.body.slice(0, 120) },
    }),
    audit: (_i, row, ctx) => ({
      key: "note.created",
      objectType: "note",
      objectId: row.id,
      meta: auditMeta(ctx),
    }),
    rescore: async (_i, row) => {
      if (row.entityType === "contact") await recomputeContactScore(row.entityId);
    },
  },
});
