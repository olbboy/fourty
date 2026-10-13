import { and, asc, eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { can } from "@/lib/permissions";
import { ActionError, type ActionContext } from "../types";

export type Note = typeof import("@/db").tables.notes.$inferSelect;

/** What the timeline shows of a note. */
export const notePreview = (body: string) => body.slice(0, 120);

/** Whoever wrote a note may change it, and an admin may (Q76); a viewer never. */
export function mayChange(note: Pick<Note, "authorId">, ctx: ActionContext): boolean {
  if (!can(ctx.role, "notes", "update")) return false;
  return ctx.role === "admin" || (ctx.userId !== null && note.authorId === ctx.userId);
}

/** The note, if the caller may change it. */
export async function changeableNote(id: string, ctx: ActionContext): Promise<Note> {
  const note = (await db.select().from(tables.notes).where(eq(tables.notes.id, id)).limit(1))[0];
  if (!note) throw new ActionError("not_found", "Note not found");
  if (!mayChange(note, ctx)) {
    throw new ActionError("forbidden", "Forbidden: only the author or an admin can change this note");
  }
  return note;
}

/**
 * The timeline line a note left. Lines written since notes became editable
 * carry the note id; older ones are matched by their preview.
 */
export async function noteTimelineLine(note: Note): Promise<string | undefined> {
  const meta = sql`(${tables.activities.meta})::jsonb`;
  return (
    await db
      .select({ id: tables.activities.id })
      .from(tables.activities)
      .where(
        and(
          eq(tables.activities.type, "note_added"),
          eq(tables.activities.entityType, note.entityType),
          eq(tables.activities.entityId, note.entityId),
          sql`(${meta} ->> 'noteId' = ${note.id} OR (${meta} ->> 'noteId' IS NULL AND ${meta} ->> 'preview' = ${notePreview(note.body)}))`,
        ),
      )
      .orderBy(asc(tables.activities.createdAt))
      .limit(1)
  )[0]?.id;
}

/**
 * Audit metadata common to every note operation. `via` marks a write as
 * agent-initiated; only the MCP and AI surfaces set it.
 */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}
