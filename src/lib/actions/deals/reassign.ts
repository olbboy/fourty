import { reassignAction } from "../reassign";
import { dealsUpdate } from "./update";

export const dealsReassign = reassignAction({
  name: "deals.reassign",
  object: "deals",
  noun: "deals",
  update: dealsUpdate,
});
