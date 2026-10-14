import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { quotesCreate, quotesList } from "@/lib/actions/quotes";

/** A deal's quotes; POST `{ validDays?, terms? }` makes one from its line items. */
const listQuotes = toRouteHandler(quotesList, { body: (quotes) => ({ quotes }) });
const createQuote = toRouteHandler(quotesCreate, { status: 201, body: (quote) => ({ quote }) });

type Params = { params: Promise<{ id: string }> };
export const GET = (req: Request, ctx: Params) => listQuotes(req, ctx);
export const POST = (req: Request, ctx: Params) => createQuote(req, ctx);
