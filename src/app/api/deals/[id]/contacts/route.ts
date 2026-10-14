import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsContacts, dealsSetContacts } from "@/lib/actions/deals";

/** The people on a deal; PUT `{ contacts: [{ contactId, role }] }` replaces the list. */
const listContacts = toRouteHandler(dealsContacts, { body: (contacts) => ({ contacts }) });
const setContacts = toRouteHandler(dealsSetContacts, { body: (out) => ({ contacts: (out as { contacts: unknown }).contacts }) });

type Params = { params: Promise<{ id: string }> };
export const GET = (req: Request, ctx: Params) => listContacts(req, ctx);
export const PUT = (req: Request, ctx: Params) => setContacts(req, ctx);
