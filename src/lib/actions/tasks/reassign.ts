import { reassignAction } from "../reassign";
import { tasksUpdate } from "./update";

export const tasksReassign = reassignAction({
  name: "tasks.reassign",
  object: "tasks",
  noun: "tasks",
  update: tasksUpdate,
});
