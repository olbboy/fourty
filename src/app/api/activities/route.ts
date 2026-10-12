import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { activitiesCreate, activitiesList } from "@/lib/actions/activities";

const listActivities = toRouteHandler(activitiesList, { body: (activities) => ({ activities }) });
const logActivity = toRouteHandler(activitiesCreate, { status: 201, body: () => ({ ok: true }) });

export const GET = (req: Request) => listActivities(req);
export const POST = (req: Request) => logActivity(req);
