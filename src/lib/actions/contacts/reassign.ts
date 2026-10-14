import { reassignAction } from "../reassign";
import { contactsUpdate } from "./update";

export const contactsReassign = reassignAction({
  name: "contacts.reassign",
  object: "contacts",
  noun: "contacts",
  update: contactsUpdate,
});
