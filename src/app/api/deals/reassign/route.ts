import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsReassign } from "@/lib/actions/deals";

/** Give many deals one owner: `{ ids, ownerId }`, all or nothing. */
const reassignDeals = toRouteHandler(dealsReassign);

export const POST = (req: Request) => reassignDeals(req);
