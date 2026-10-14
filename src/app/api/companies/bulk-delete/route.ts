import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { companiesBulkDelete } from "@/lib/actions/companies";

/** `{ ids }`: every record or none. */
const handler = toRouteHandler(companiesBulkDelete);

export const POST = (req: Request) => handler(req);
