import { register } from "../registry";
import { companiesList } from "./list";
import { companiesGet } from "./get";
import { companiesCreate } from "./create";
import { companiesUpdate } from "./update";
import { companiesDelete } from "./delete";

register(companiesList);
register(companiesGet);
register(companiesCreate);
register(companiesUpdate);
register(companiesDelete);

export { companiesList, companiesGet, companiesCreate, companiesUpdate, companiesDelete };
