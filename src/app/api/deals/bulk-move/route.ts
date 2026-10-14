import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsBulkMove } from "@/lib/actions/deals";

/** `{ ids, stageId }`: every record or none. */
const handler = toRouteHandler(dealsBulkMove);

export const POST = (req: Request) => handler(req);
