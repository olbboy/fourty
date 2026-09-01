import { eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError } from "@/lib/api";
import { newId } from "@/lib/id";
import { parseCsvObjects } from "@/lib/csv";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { applyCustomFieldValues, type FieldDef } from "@/lib/records";
import { customFieldDefsOf, encodeCustom, parseCustomBlob } from "@/lib/custom-fields";
import { blockedWrites, loadFieldPolicy } from "@/lib/field-permissions";

const MAX_ROWS = 5000;

/** Headers the importer already maps to built-in contact fields (normalized). */
const BUILTIN_HEADER_NORMS = new Set([
  "firstname",
  "first",
  "name",
  "fullname",
  "lastname",
  "last",
  "surname",
  "email",
  "emailaddress",
  "phone",
  "phonenumber",
  "mobile",
  "tel",
  "jobtitle",
  "title",
  "role",
  "position",
  "linkedin",
  "linkedinurl",
  "city",
  "town",
  "country",
  "source",
  "leadsource",
  "company",
  "companyname",
  "organization",
  "org",
  "status",
  "stage",
  "lifecycle",
  "score",
]);

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");

/**
 * Pull custom-field cells whose header is the field key or label. Invalid
 * values (javascript: on a url, a bad date, …) are dropped, same as an
 * unrecognised status — the rest of the row still imports.
 */
function pickCustomColumns(defs: FieldDef[], row: Record<string, string>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const def of defs) {
    const aliases = [norm(def.key), norm(def.label)];
    let raw: string | undefined;
    for (const key of Object.keys(row)) {
      if (aliases.includes(norm(key)) && row[key] !== "") {
        raw = row[key];
        break;
      }
    }
    if (raw === undefined) continue;
    const one = applyCustomFieldValues([def], { [def.key]: raw });
    if (one.ok && Object.prototype.hasOwnProperty.call(one.data, def.key)) {
      input[def.key] = one.data[def.key];
    }
  }
  return input;
}

/**
 * CSV import with smart header mapping and company auto-linking:
 * a "company" column matches an existing company by name (case-insensitive)
 * or creates it on the fly. A row whose email matches an existing contact
 * updates that contact instead of creating a duplicate. Custom-field columns
 * (key or label) round-trip the values export writes.
 */
export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "contacts", "create");
    if (denied) return denied;

    const text = await req.text();
    if (!text.trim()) return apiError("Empty file");
    const rows = parseCsvObjects(text);
    if (rows.length === 0) return apiError("No data rows found — is the first row a header?");
    if (rows.length > MAX_ROWS) return apiError(`Too many rows (max ${MAX_ROWS})`);

    const pick = (row: Record<string, string>, ...names: string[]) => {
      for (const key of Object.keys(row)) {
        if (names.includes(norm(key)) && row[key]) return row[key];
      }
      return null;
    };

    const companies = await db.select().from(tables.companies);
    const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c.id]));
    const defs = (await customFieldDefsOf("contact")).filter((d) => !BUILTIN_HEADER_NORMS.has(norm(d.key)));
    const policy = await loadFieldPolicy(auth.role);
    const customWritable = !blockedWrites(policy, "contacts", ["custom"]).includes("custom");

    let created = 0;
    let updated = 0;
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
      const phone = pick(row, "phone", "phonenumber", "mobile", "tel");
      const jobTitle = pick(row, "jobtitle", "title", "role", "position");
      const linkedin = pick(row, "linkedin", "linkedinurl");
      const city = pick(row, "city", "town");
      const country = pick(row, "country");
      const source = pick(row, "source", "leadsource");

      let companyId: string | null = null;
      const companyName = pick(row, "company", "companyname", "organization", "org");
      if (companyName) {
        companyId = companyByName.get(companyName.toLowerCase()) ?? null;
        if (!companyId) {
          companyId = newId();
          await db.insert(tables.companies).values({
            id: companyId,
            name: companyName,
            ownerId: auth.user?.id ?? null,
            createdAt: now,
            updatedAt: now,
          });
          companyByName.set(companyName.toLowerCase(), companyId);
          companiesCreated++;
        }
      }

      const statusRaw = pick(row, "status", "stage", "lifecycle")?.toLowerCase();
      const status = ["lead", "qualified", "customer", "churned"].includes(statusRaw ?? "")
        ? statusRaw!
        : null;

      const pickedCustom = customWritable ? pickCustomColumns(defs, row) : {};

      const resolveCustom = async (
        existing: string | null,
      ): Promise<{ json: string } | "keep" | "skip"> => {
        if (defs.length === 0) return "keep";
        if (!customWritable) {
          if (existing === null) {
            const encoded = await encodeCustom("contact", {});
            return encoded.ok ? { json: encoded.json } : "skip";
          }
          return "keep";
        }
        if (existing !== null && Object.keys(pickedCustom).length === 0) return "keep";
        const base = existing === null ? {} : parseCustomBlob(existing);
        const encoded = await encodeCustom("contact", { ...base, ...pickedCustom });
        if (encoded.ok) return { json: encoded.json };
        return existing === null ? "skip" : "keep";
      };

      if (email) {
        const dupe = (
          await db
            .select()
            .from(tables.contacts)
            .where(sql`lower(${tables.contacts.email}) = ${email.toLowerCase()}`)
            .limit(1)
        )[0];
        if (dupe) {
          const custom = await resolveCustom(dupe.custom);
          await db
            .update(tables.contacts)
            .set({
              firstName,
              ...(lastName ? { lastName } : {}),
              ...(phone ? { phone } : {}),
              ...(jobTitle ? { jobTitle } : {}),
              ...(companyId ? { companyId } : {}),
              ...(status ? { status } : {}),
              ...(source ? { source } : {}),
              ...(linkedin ? { linkedin } : {}),
              ...(city ? { city } : {}),
              ...(country ? { country } : {}),
              ...(custom === "keep" || custom === "skip" ? {} : { custom: custom.json }),
              updatedAt: now,
            })
            .where(eq(tables.contacts.id, dupe.id));
          await logActivity({
            type: "updated",
            entityType: "contact",
            entityId: dupe.id,
            actorId: auth.user?.id,
            meta: { via: "csv-import" },
          });
          await recomputeContactScore(dupe.id);
          updated++;
          continue;
        }
      }

      const custom = await resolveCustom(null);
      if (custom === "skip") {
        skipped++;
        continue;
      }
      const id = newId();
      await db.insert(tables.contacts).values({
        id,
        firstName,
        lastName,
        email,
        phone,
        jobTitle,
        companyId,
        ownerId: auth.user?.id ?? null,
        status: status ?? "lead",
        source: source ?? "other",
        linkedin,
        city,
        country,
        ...(custom === "keep" ? {} : { custom: custom.json }),
        createdAt: now,
        updatedAt: now,
      });
      await logActivity({
        type: "created",
        entityType: "contact",
        entityId: id,
        actorId: auth.user?.id,
        meta: { via: "csv-import" },
      });
      await recomputeContactScore(id);
      created++;
    }

    await audit(auth.user?.id, "contacts.imported", {
      meta: { created, updated, skipped, companiesCreated, total: rows.length },
    });
    return json({ created, updated, skipped, companiesCreated, total: rows.length });
  });
}
