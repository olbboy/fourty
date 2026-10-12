import { withAuth, authorize, json, apiError } from "@/lib/api";
import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { companiesCreate, companiesList } from "@/lib/actions/companies";
import { companyQueryPolicy, normalizeCompanyQuery } from "@/lib/company-query";
import { companyList } from "@/lib/company-list";
import { loadFieldPolicy } from "@/lib/field-permissions";

// Keep the action bound to REST so the registry continues to describe every
// surface. The REST list has an extended response contract (page + facets),
// so GET below adds that query seam around the same database boundary.
const listCompanies = toRouteHandler(companiesList, { body: (companies) => ({ companies }) });
void listCompanies;

const createCompany = toRouteHandler(companiesCreate, { status: 201, body: (company) => ({ company }) });

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "companies", "read");
    if (denied) return denied;

    const parsed = normalizeCompanyQuery(new URL(req.url).searchParams);
    if (!parsed.ok) return apiError(parsed.message, 400);

    const policy = await loadFieldPolicy(auth.role);
    const allowed = companyQueryPolicy(parsed.value, policy);
    if (!allowed.ok) return apiError(allowed.message, allowed.status);
    return json(await companyList(parsed.value, allowed, policy));
  });
}

export const POST = (req: Request) => createCompany(req);
