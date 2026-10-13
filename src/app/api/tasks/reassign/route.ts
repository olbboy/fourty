import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { tasksReassign } from "@/lib/actions/tasks";

/** Give many tasks one owner: `{ ids, ownerId }`, all or nothing. */
const reassignTasks = toRouteHandler(tasksReassign);

export const POST = (req: Request) => reassignTasks(req);
