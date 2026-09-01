import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsDelete, dealsGet, dealsUpdate } from "@/lib/actions/deals";

type Params = { params: Promise<{ id: string }> };

const getDeal = toRouteHandler(dealsGet, { body: (deal) => ({ deal }) });
const updateDeal = toRouteHandler(dealsUpdate, { body: (deal) => ({ deal }) });
// REST has never offered the dry run the MCP tool does; a DELETE here deletes.
const deleteDeal = toRouteHandler(dealsDelete, { body: () => ({ ok: true }) });

export const GET = (req: Request, ctx: Params) => getDeal(req, ctx);
export const PATCH = (req: Request, ctx: Params) => updateDeal(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteDeal(req, ctx);
