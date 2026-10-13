import { register } from "../registry";
import { dealsList } from "./list";
import { dealsGet } from "./get";
import { dealsCreate } from "./create";
import { dealsUpdate } from "./update";
import { dealsDelete } from "./delete";
import { dealsReassign } from "./reassign";
import { dealsContacts, dealsSetContacts } from "./contacts";

register(dealsList);
register(dealsGet);
register(dealsCreate);
register(dealsUpdate);
register(dealsDelete);
register(dealsReassign);
register(dealsContacts);
register(dealsSetContacts);

export { dealsList, dealsGet, dealsCreate, dealsUpdate, dealsDelete, dealsReassign, dealsContacts, dealsSetContacts };
