import { ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json } from "@/lib/api";
import { canReadField, loadFieldPolicy, type FieldPolicy } from "@/lib/field-permissions";

type SearchResult = {
  type: "contact" | "company" | "deal";
  id: string;
  title: string;
  subtitle: string | null;
};

const RESULT_LIMIT = 5;

function contactSearchWhere(policy: FieldPolicy | null, pattern: string): SQL | null {
  const predicates: SQL[] = [];
  const firstNameReadable = canReadField(policy, "contacts", "firstName");
  const lastNameReadable = canReadField(policy, "contacts", "lastName");

  // A concatenated name is only a valid predicate when both parts are readable.
  // If one part is hidden, search the readable part by itself instead.
  if (firstNameReadable && lastNameReadable) {
    predicates.push(ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern));
  } else {
    if (firstNameReadable) predicates.push(ilike(tables.contacts.firstName, pattern));
    if (lastNameReadable) predicates.push(ilike(tables.contacts.lastName, pattern));
  }
  if (canReadField(policy, "contacts", "email")) {
    predicates.push(ilike(tables.contacts.email, pattern));
  }

  return predicates.length ? or(...predicates)! : null;
}

function companySearchWhere(policy: FieldPolicy | null, pattern: string): SQL | null {
  const predicates: SQL[] = [];
  if (canReadField(policy, "companies", "name")) {
    predicates.push(ilike(tables.companies.name, pattern));
  }
  if (canReadField(policy, "companies", "domain")) {
    predicates.push(ilike(tables.companies.domain, pattern));
  }
  return predicates.length ? or(...predicates)! : null;
}

function contactResult(policy: FieldPolicy | null, row: typeof tables.contacts.$inferSelect): SearchResult | null {
  const nameParts = [
    canReadField(policy, "contacts", "firstName") ? row.firstName : null,
    canReadField(policy, "contacts", "lastName") ? row.lastName : null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  const title = nameParts.join(" ").trim();
  if (!title) return null;

  const subtitle =
    (canReadField(policy, "contacts", "email") && row.email) ||
    (canReadField(policy, "contacts", "jobTitle") && row.jobTitle) ||
    null;
  return { type: "contact", id: row.id, title, subtitle };
}

function companyResult(policy: FieldPolicy | null, row: typeof tables.companies.$inferSelect): SearchResult | null {
  const title = canReadField(policy, "companies", "name") ? row.name.trim() : "";
  if (!title) return null;

  const subtitle =
    (canReadField(policy, "companies", "domain") && row.domain) ||
    (canReadField(policy, "companies", "industry") && row.industry) ||
    null;
  return { type: "company", id: row.id, title, subtitle };
}

function dealResult(policy: FieldPolicy | null, row: typeof tables.deals.$inferSelect): SearchResult | null {
  const title = canReadField(policy, "deals", "name") ? row.name.trim() : "";
  if (!title) return null;

  const subtitle =
    canReadField(policy, "deals", "amount") && canReadField(policy, "deals", "currency")
      ? `${row.currency} ${row.amount.toLocaleString()}`
      : null;
  return { type: "deal", id: row.id, title, subtitle };
}

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    // Search spans three CRM objects. Keep the same read gate as their detail/list
    // surfaces, while preserving the established `{ results }` response shape.
    for (const object of ["contacts", "companies", "deals"] as const) {
      const denied = authorize(auth, object, "read");
      if (denied) return denied;
    }

    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!q) return json({ results: [] });

    // Load policy before constructing any object predicate. A hidden field must
    // never participate in WHERE, even if its value would be redacted later.
    const policy = await loadFieldPolicy(auth.role);
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const results: SearchResult[] = [];

    const contactWhere =
      canReadField(policy, "contacts", "id") ? contactSearchWhere(policy, pattern) : null;
    if (contactWhere) {
      const rows = await db.select().from(tables.contacts).where(contactWhere).limit(RESULT_LIMIT);
      for (const row of rows) {
        const result = contactResult(policy, row);
        if (result) results.push(result);
      }
    }

    const companyWhere =
      canReadField(policy, "companies", "id") ? companySearchWhere(policy, pattern) : null;
    if (companyWhere) {
      const rows = await db.select().from(tables.companies).where(companyWhere).limit(RESULT_LIMIT);
      for (const row of rows) {
        const result = companyResult(policy, row);
        if (result) results.push(result);
      }
    }

    const dealWhere =
      canReadField(policy, "deals", "id") && canReadField(policy, "deals", "name")
        ? ilike(tables.deals.name, pattern)
        : null;
    if (dealWhere) {
      const rows = await db.select().from(tables.deals).where(dealWhere).limit(RESULT_LIMIT);
      for (const row of rows) {
        const result = dealResult(policy, row);
        if (result) results.push(result);
      }
    }

    return json({ results });
  });
}
