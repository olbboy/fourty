import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsCreate, contactsList } from "@/lib/actions/contacts";

const listContacts = toRouteHandler(contactsList, { body: (contacts) => ({ contacts }) });
const createContact = toRouteHandler(contactsCreate, { status: 201, body: (contact) => ({ contact }) });

// Narrowed to one argument: this route has no dynamic segment, and Next checks
// the exported handler's signature against the route's own parameters.
export const GET = (req: Request) => listContacts(req);
export const POST = (req: Request) => createContact(req);
