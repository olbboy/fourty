import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsReassign } from "@/lib/actions/contacts";

/** Give many contacts one owner: `{ ids, ownerId }`, all or nothing. */
const reassignContacts = toRouteHandler(contactsReassign);

export const POST = (req: Request) => reassignContacts(req);
