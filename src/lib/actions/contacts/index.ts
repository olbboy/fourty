import { register } from "../registry";
import { contactsList } from "./list";
import { contactsGet } from "./get";
import { contactsCreate } from "./create";
import { contactsUpdate } from "./update";
import { contactsDelete } from "./delete";
import { contactsReassign } from "./reassign";
import { contactsBulkDelete } from "./bulk";

// Every contact operation, defined once and served by every surface.
register(contactsList);
register(contactsGet);
register(contactsCreate);
register(contactsUpdate);
register(contactsDelete);
register(contactsReassign);
register(contactsBulkDelete);

export { contactsList, contactsGet, contactsCreate, contactsUpdate, contactsDelete, contactsReassign, contactsBulkDelete };
