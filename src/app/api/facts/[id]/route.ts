import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { factsDecide } from "@/lib/actions/facts";

type Params = { params: Promise<{ id: string }> };

/**
 * Decide one suggestion. PATCH rather than POST: the fact already exists and
 * this changes its status. `{ id }` comes from the path, the decision from the
 * body, and the adapter merges the two.
 */
const decide = toRouteHandler(factsDecide, { body: (result) => ({ result }) });

// The route parameter is required here, so the export declares it — Next
// type-checks each export against its own route segment.
export const PATCH = (req: Request, ctx: Params) => decide(req, ctx);
