import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { productsCreate, productsList } from "@/lib/actions/products";

const listProducts = toRouteHandler(productsList, { body: (products) => ({ products }) });
const createProduct = toRouteHandler(productsCreate, { status: 201, body: (product) => ({ product }) });

export const GET = (req: Request) => listProducts(req);
export const POST = (req: Request) => createProduct(req);
