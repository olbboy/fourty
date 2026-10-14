import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsMerge } from "@/lib/actions/merge";

/** `{ duplicateId }`: fold that record into this one; it goes to the Trash. */
const merge = toRouteHandler(contactsMerge);

type Params = { params: Promise<{ id: string }> };
export const POST = (req: Request, ctx: Params) => merge(req, ctx);
