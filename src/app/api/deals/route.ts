import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsCreate, dealsList } from "@/lib/actions/deals";

const listDeals = toRouteHandler(dealsList, { body: (deals) => ({ deals }) });
const createDeal = toRouteHandler(dealsCreate, { status: 201, body: (deal) => ({ deal }) });

export const GET = (req: Request) => listDeals(req);
export const POST = (req: Request) => createDeal(req);
