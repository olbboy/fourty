import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsDelete, contactsGet, contactsUpdate } from "@/lib/actions/contacts";

type Params = { params: Promise<{ id: string }> };

const getContact = toRouteHandler(contactsGet, { body: (contact) => ({ contact }) });
const updateContact = toRouteHandler(contactsUpdate, { body: (contact) => ({ contact }) });
// REST has never offered the dry run the MCP tool does; a DELETE here deletes.
const deleteContact = toRouteHandler(contactsDelete, { body: () => ({ ok: true }) });

// The route parameter is required here, so the exported handlers declare it —
// Next type-checks each export against its own route segment.
export const GET = (req: Request, ctx: Params) => getContact(req, ctx);
export const PATCH = (req: Request, ctx: Params) => updateContact(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteContact(req, ctx);
