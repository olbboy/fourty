import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { companiesReassign } from "@/lib/actions/companies";

/** Give many companies one owner: `{ ids, ownerId }`, all or nothing. */
const reassignCompanies = toRouteHandler(companiesReassign);

export const POST = (req: Request) => reassignCompanies(req);
