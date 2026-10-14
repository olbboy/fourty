import { reassignAction } from "../reassign";
import { companiesUpdate } from "./update";

export const companiesReassign = reassignAction({
  name: "companies.reassign",
  object: "companies",
  noun: "companies",
  update: companiesUpdate,
});
