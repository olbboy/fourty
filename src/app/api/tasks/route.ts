import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { tasksCreate, tasksList } from "@/lib/actions/tasks";

const listTasks = toRouteHandler(tasksList, { body: (tasks) => ({ tasks }) });
const createTask = toRouteHandler(tasksCreate, { status: 201, body: (task) => ({ task }) });

export const GET = (req: Request) => listTasks(req);
export const POST = (req: Request) => createTask(req);
