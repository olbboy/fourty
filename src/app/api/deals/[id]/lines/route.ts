import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { dealsLines, dealsSetLines } from "@/lib/actions/deals";

/** A deal's line items; PUT `{ lines: [{ productId?, name?, quantity, unitPrice? }] }` replaces them. */
const listLines = toRouteHandler(dealsLines);
const setLines = toRouteHandler(dealsSetLines, {
  body: (out) => {
    const { lines, total } = out as { lines: unknown; total: unknown };
    return { lines, total };
  },
});

type Params = { params: Promise<{ id: string }> };
export const GET = (req: Request, ctx: Params) => listLines(req, ctx);
export const PUT = (req: Request, ctx: Params) => setLines(req, ctx);
