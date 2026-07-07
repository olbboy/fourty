import { ilike, or, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return json({ results: [] });
  const pattern = `%${q.replace(/[%_]/g, "")}%`;

  const contacts = await db
    .select()
    .from(tables.contacts)
    .where(
      or(
        ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern),
        ilike(tables.contacts.email, pattern),
      ),
    )
    .limit(5);

  const companies = await db
    .select()
    .from(tables.companies)
    .where(or(ilike(tables.companies.name, pattern), ilike(tables.companies.domain, pattern)))
    .limit(5);

  const deals = await db
    .select()
    .from(tables.deals)
    .where(ilike(tables.deals.name, pattern))
    .limit(5);

  return json({
    results: [
      ...contacts.map((c) => ({
        type: "contact",
        id: c.id,
        title: `${c.firstName} ${c.lastName}`.trim(),
        subtitle: c.email ?? c.jobTitle,
      })),
      ...companies.map((c) => ({
        type: "company",
        id: c.id,
        title: c.name,
        subtitle: c.domain ?? c.industry,
      })),
      ...deals.map((d) => ({
        type: "deal",
        id: d.id,
        title: d.name,
        subtitle: `${d.currency} ${d.amount.toLocaleString()}`,
      })),
    ],
  });
}
