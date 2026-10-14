import { bulkDeleteAction } from "../bulk";
import { contactsDelete } from "./delete";

export const contactsBulkDelete = bulkDeleteAction({ name: "contacts.bulkDelete", object: "contacts", noun: "contacts", remove: contactsDelete });
