import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { tasksBulkDelete } from "@/lib/actions/tasks";

/** `{ ids }`: every record or none. */
const handler = toRouteHandler(tasksBulkDelete);

export const POST = (req: Request) => handler(req);
