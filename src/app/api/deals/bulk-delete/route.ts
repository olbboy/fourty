import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsBulkDelete } from "@/lib/actions/deals";

/** `{ ids }`: every record or none. */
const handler = toRouteHandler(dealsBulkDelete);

export const POST = (req: Request) => handler(req);
