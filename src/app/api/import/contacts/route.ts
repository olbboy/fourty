import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError } from "@/lib/api";
import { newId } from "@/lib/id";
import { parseCsvObjects } from "@/lib/csv";
import { logActivity } from "@/lib/activity";
import { recomputeContactScore } from "@/lib/services/contact-score";

const MAX_ROWS = 5000;

/**
 * CSV import with smart header mapping and company auto-linking:
 * a "company" column matches an existing company by name (case-insensitive)
 * or creates it on the fly — one upload, whole book of business.
 */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const text = await req.text();
  if (!text.trim()) return apiError("Empty file");
  const rows = parseCsvObjects(text);
  if (rows.length === 0) return apiError("No data rows found — is the first row a header?");
  if (rows.length > MAX_ROWS) return apiError(`Too many rows (max ${MAX_ROWS})`);

  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const pick = (row: Record<string, string>, ...names: string[]) => {
    for (const key of Object.keys(row)) {
      if (names.includes(norm(key)) && row[key]) return row[key];
    }
    return null;
  };

  const companies = db.select().from(tables.companies).all();
  const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c.id]));

  let created = 0;
  let skipped = 0;
  let companiesCreated = 0;
  const now = Date.now();

  for (const row of rows) {
    const firstName =
      pick(row, "firstname", "first") ?? pick(row, "name", "fullname")?.split(/\s+/)[0] ?? null;
    if (!firstName) {
      skipped++;
      continue;
    }
    const fullName = pick(row, "name", "fullname");
    const lastName =
      pick(row, "lastname", "last", "surname") ??
      (fullName ? fullName.split(/\s+/).slice(1).join(" ") : "");

    const email = pick(row, "email", "emailaddress");
    if (email) {
      const dupe = db.select().from(tables.contacts).where(eq(tables.contacts.email, email)).get();
      if (dupe) {
        skipped++;
        continue;
      }
    }

    let companyId: string | null = null;
    const companyName = pick(row, "company", "companyname", "organization", "org");
    if (companyName) {
      companyId = companyByName.get(companyName.toLowerCase()) ?? null;
      if (!companyId) {
        companyId = newId();
        db.insert(tables.companies)
          .values({ id: companyId, name: companyName, ownerId: auth.user?.id ?? null, createdAt: now, updatedAt: now })
          .run();
        companyByName.set(companyName.toLowerCase(), companyId);
        companiesCreated++;
      }
    }

    const statusRaw = pick(row, "status", "stage", "lifecycle")?.toLowerCase();
    const status = ["lead", "qualified", "customer", "churned"].includes(statusRaw ?? "")
      ? statusRaw!
      : "lead";

    const id = newId();
    db.insert(tables.contacts)
      .values({
        id,
        firstName,
        lastName,
        email,
        phone: pick(row, "phone", "phonenumber", "mobile", "tel"),
        jobTitle: pick(row, "jobtitle", "title", "role", "position"),
        companyId,
        ownerId: auth.user?.id ?? null,
        status,
        source: pick(row, "source", "leadsource") ?? "other",
        linkedin: pick(row, "linkedin", "linkedinurl"),
        city: pick(row, "city", "town"),
        country: pick(row, "country"),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    logActivity({ type: "created", entityType: "contact", entityId: id, actorId: auth.user?.id, meta: { via: "csv-import" } });
    recomputeContactScore(id);
    created++;
  }

  return json({ created, skipped, companiesCreated, total: rows.length });
}
