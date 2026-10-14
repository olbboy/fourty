import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { ownerStats } from "@/lib/actions/targets";

/** `?period=2026-Q4` (default: this quarter): the owner table with targets. */
const owners = toRouteHandler(ownerStats);

export const GET = (req: Request) => owners(req);
