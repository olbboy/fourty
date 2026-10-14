import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { quotesGet } from "@/lib/actions/quotes";

const getQuote = toRouteHandler(quotesGet, { body: (quote) => ({ quote }) });

type Params = { params: Promise<{ id: string }> };
export const GET = (req: Request, ctx: Params) => getQuote(req, ctx);
