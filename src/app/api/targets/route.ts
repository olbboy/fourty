import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { targetsSet } from "@/lib/actions/targets";

/** Admins: PUT `{ userId, period: "2026-Q4", amount | null }`. */
const setTarget = toRouteHandler(targetsSet);

export const PUT = (req: Request) => setTarget(req);
