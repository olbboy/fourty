import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsBulkDelete } from "@/lib/actions/contacts";

/** `{ ids }`: every record or none. */
const handler = toRouteHandler(contactsBulkDelete);

export const POST = (req: Request) => handler(req);
