import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { tasksDelete, tasksGet, tasksUpdate } from "@/lib/actions/tasks";

type Params = { params: Promise<{ id: string }> };

const getTask = toRouteHandler(tasksGet, { body: (task) => ({ task }) });
const updateTask = toRouteHandler(tasksUpdate, { body: (task) => ({ task }) });
// REST has never offered the dry run the MCP tool does; a DELETE here deletes.
const deleteTask = toRouteHandler(tasksDelete, { body: () => ({ ok: true }) });

export const GET = (req: Request, ctx: Params) => getTask(req, ctx);
export const PATCH = (req: Request, ctx: Params) => updateTask(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteTask(req, ctx);
