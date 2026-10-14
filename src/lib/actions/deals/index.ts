import { register } from "../registry";
import { dealsList } from "./list";
import { dealsGet } from "./get";
import { dealsCreate } from "./create";
import { dealsUpdate } from "./update";
import { dealsDelete } from "./delete";
import { dealsReassign } from "./reassign";
import { dealsContacts, dealsSetContacts } from "./contacts";
import { dealsLines, dealsSetLines } from "./lines";
import { dealsBulkDelete, dealsBulkMove } from "./bulk";

register(dealsList);
register(dealsGet);
register(dealsCreate);
register(dealsUpdate);
register(dealsDelete);
register(dealsReassign);
register(dealsContacts);
register(dealsSetContacts);
register(dealsLines);
register(dealsSetLines);
register(dealsBulkMove);
register(dealsBulkDelete);

export { dealsList, dealsGet, dealsCreate, dealsUpdate, dealsDelete, dealsReassign, dealsContacts, dealsSetContacts, dealsLines, dealsSetLines, dealsBulkMove, dealsBulkDelete };
