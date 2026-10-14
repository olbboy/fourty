import { bulkDeleteAction } from "../bulk";
import { companiesDelete } from "./delete";

export const companiesBulkDelete = bulkDeleteAction({ name: "companies.bulkDelete", object: "companies", noun: "companies", remove: companiesDelete });
