import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { productsDelete, productsUpdate } from "@/lib/actions/products";

type Params = { params: Promise<{ id: string }> };

const updateProduct = toRouteHandler(productsUpdate, { body: (product) => ({ product }) });
const deleteProduct = toRouteHandler(productsDelete, { body: () => ({ ok: true }) });

export const PATCH = (req: Request, ctx: Params) => updateProduct(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteProduct(req, ctx);
