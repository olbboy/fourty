import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { companiesDelete, companiesGet, companiesUpdate } from "@/lib/actions/companies";

type Params = { params: Promise<{ id: string }> };

const getCompany = toRouteHandler(companiesGet, { body: (company) => ({ company }) });
const updateCompany = toRouteHandler(companiesUpdate, { body: (company) => ({ company }) });
// REST has never offered the dry run the MCP tool does; a DELETE here deletes.
const deleteCompany = toRouteHandler(companiesDelete, { body: () => ({ ok: true }) });

export const GET = (req: Request, ctx: Params) => getCompany(req, ctx);
export const PATCH = (req: Request, ctx: Params) => updateCompany(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteCompany(req, ctx);
