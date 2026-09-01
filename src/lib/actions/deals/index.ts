import { register } from "../registry";
import { dealsList } from "./list";
import { dealsGet } from "./get";
import { dealsCreate } from "./create";
import { dealsUpdate } from "./update";
import { dealsDelete } from "./delete";

register(dealsList);
register(dealsGet);
register(dealsCreate);
register(dealsUpdate);
register(dealsDelete);

export { dealsList, dealsGet, dealsCreate, dealsUpdate, dealsDelete };
