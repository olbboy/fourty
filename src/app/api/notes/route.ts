import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { notesCreate, notesList } from "@/lib/actions/notes";

const listNotes = toRouteHandler(notesList, { body: (notes) => ({ notes }) });
const createNote = toRouteHandler(notesCreate, { status: 201, body: (note) => ({ note }) });

export const GET = (req: Request) => listNotes(req);
export const POST = (req: Request) => createNote(req);
