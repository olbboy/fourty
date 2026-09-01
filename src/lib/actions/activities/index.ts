import { register } from "../registry";
import { activitiesList } from "./list";
import { activitiesCreate } from "./create";

register(activitiesList);
register(activitiesCreate);

export { activitiesList, activitiesCreate };
