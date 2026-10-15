import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsCreate, contactsCreateOrFill, contactsList } from "@/lib/actions/contacts";
import { apiError } from "@/lib/api";

const listContacts = toRouteHandler(contactsList, { body: (contacts) => ({ contacts }) });
const createContact = toRouteHandler(contactsCreate, { status: 201, body: (contact) => ({ contact }) });
// `?ifExists=fill` (Q104): a lead from another system makes a contact (201), or
// fills the empty fields of the one with its email (200, `existed: true`).
const receiveLead = toRouteHandler(contactsCreateOrFill, {
  status: (out) => ((out as { existed: boolean }).existed ? 200 : 201),
  body: (out) => {
    const { contact, existed } = out as { contact: unknown; existed: boolean };
    return { contact, existed };
  },
});

// Narrowed to one argument: this route has no dynamic segment, and Next checks
// the exported handler's signature against the route's own parameters.
export const GET = (req: Request) => listContacts(req);
export const POST = (req: Request) => {
  const ifExists = new URL(req.url).searchParams.get("ifExists");
  if (ifExists === null) return createContact(req);
  if (ifExists === "fill") return receiveLead(req);
  return Promise.resolve(apiError(`ifExists: "${ifExists}" is not supported; use ifExists=fill`));
};
