import { register } from "../registry";
import { tasksList } from "./list";
import { tasksGet } from "./get";
import { tasksCreate } from "./create";
import { tasksUpdate } from "./update";
import { tasksDelete } from "./delete";
import { tasksReassign } from "./reassign";

register(tasksList);
register(tasksGet);
register(tasksCreate);
register(tasksUpdate);
register(tasksDelete);
register(tasksReassign);

export { tasksList, tasksGet, tasksCreate, tasksUpdate, tasksDelete, tasksReassign };
