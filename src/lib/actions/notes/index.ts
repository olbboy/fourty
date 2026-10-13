import { register } from "../registry";
import { notesList } from "./list";
import { notesCreate } from "./create";
import { notesUpdate } from "./update";
import { notesDelete } from "./delete";

register(notesList);
register(notesCreate);
register(notesUpdate);
register(notesDelete);

export { notesList, notesCreate, notesUpdate, notesDelete };
