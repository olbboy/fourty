import { register } from "../registry";
import { companiesList } from "./list";
import { companiesGet } from "./get";
import { companiesCreate } from "./create";
import { companiesUpdate } from "./update";
import { companiesDelete } from "./delete";
import { companiesReassign } from "./reassign";
import { companiesBulkDelete } from "./bulk";

register(companiesList);
register(companiesGet);
register(companiesCreate);
register(companiesUpdate);
register(companiesDelete);
register(companiesReassign);
register(companiesBulkDelete);

export { companiesList, companiesGet, companiesCreate, companiesUpdate, companiesDelete, companiesReassign, companiesBulkDelete };
