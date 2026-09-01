import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { companiesCreate, companiesList } from "@/lib/actions/companies";

const listCompanies = toRouteHandler(companiesList, { body: (companies) => ({ companies }) });
const createCompany = toRouteHandler(companiesCreate, { status: 201, body: (company) => ({ company }) });

export const GET = (req: Request) => listCompanies(req);
export const POST = (req: Request) => createCompany(req);
