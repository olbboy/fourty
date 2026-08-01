import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json } from "@/lib/api";
import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { contactsCreate } from "@/lib/actions/contacts/create";
import { loadFieldPolicy, redact } from "@/lib/field-permissions";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const status = params.get("status");
  const companyId = params.get("companyId");
  const sort = params.get("sort") ?? "updatedAt";
  const limit = Math.min(Number(params.get("limit")) || 200, 500);

  const where: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern),
        ilike(tables.contacts.email, pattern),
        ilike(tables.contacts.jobTitle, pattern),
      )!,
    );
  }
  if (status) where.push(eq(tables.contacts.status, status));
  if (companyId) where.push(eq(tables.contacts.companyId, companyId));

  const orderCol =
    sort === "score"
      ? desc(tables.contacts.score)
      : sort === "name"
        ? tables.contacts.firstName
        : sort === "createdAt"
          ? desc(tables.contacts.createdAt)
          : desc(tables.contacts.updatedAt);

  const rows = await db
    .select()
    .from(tables.contacts)
    .where(where.length ? and(...where) : undefined)
    .orderBy(orderCol)
    .limit(limit);

  const policy = await loadFieldPolicy(auth.role);
  return json({
    contacts: rows.map((r) => redact(policy, "contacts", { ...r, custom: JSON.parse(r.custom) })),
  });
  });
}

const createContact = toRouteHandler(contactsCreate, { status: 201, body: (contact) => ({ contact }) });

// Narrowed to one argument: this route has no dynamic segment, and Next checks
// the exported handler's signature against the route's own parameters.
export const POST = (req: Request) => createContact(req);
