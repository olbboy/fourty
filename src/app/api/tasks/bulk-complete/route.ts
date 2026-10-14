import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { tasksBulkComplete } from "@/lib/actions/tasks";

/** `{ ids }`: every record or none. */
const handler = toRouteHandler(tasksBulkComplete);

export const POST = (req: Request) => handler(req);
