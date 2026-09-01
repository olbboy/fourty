import { register } from "../registry";
import { notesList } from "./list";
import { notesCreate } from "./create";

register(notesList);
register(notesCreate);

export { notesList, notesCreate };
