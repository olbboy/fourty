import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { notesDelete, notesUpdate } from "@/lib/actions/notes";

type Params = { params: Promise<{ id: string }> };

/** Correct a note's text: `{ body }`. Author or admin only. */
const updateNote = toRouteHandler(notesUpdate, { body: (note) => ({ note }) });
// As for the other records, a REST DELETE deletes outright.
const deleteNote = toRouteHandler(notesDelete, { body: () => ({ ok: true }) });

export const PATCH = (req: Request, ctx: Params) => updateNote(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteNote(req, ctx);
