import { db, tables } from "@/db";
import { withAuth, apiError, authorize } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { customFieldDefsOf, parseCustomBlob, type CustomEntity } from "@/lib/custom-fields";
import { canReadField, loadFieldPolicy, redact, type FieldPolicy } from "@/lib/field-permissions";

/** CSV header → field-permission key when they differ (resolved names vs ids). */
type HeaderFields = Record<string, string>;

function readableHeaders(
  policy: FieldPolicy | null,
  object: string,
  headers: string[],
  fields: HeaderFields = {},
): string[] {
  const sample = Object.fromEntries(headers.map((h) => [fields[h] ?? h, true]));
  const kept = redact(policy, object, sample);
  return headers.filter((h) => (fields[h] ?? h) in kept);
}

function project(
  headers: string[],
  visible: string[],
  values: (string | number | null | undefined)[],
): (string | number | null | undefined)[] {
  const byName = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  return visible.map((h) => byName[h]);
}

function customCsvCell(type: string, value: unknown): string | number {
  if (value === undefined || value === null || value === "") return "";
  if (type === "date") {
    const n = typeof value === "number" ? value : Date.parse(String(value));
    return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : "";
  }
  if (type === "checkbox") return value === true || value === "true" || value === 1 || value === "1" ? "true" : "false";
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : "";
  }
  return String(value);
}

/** Current custom-field defs as extra CSV columns. Hidden with the `custom` blob. */
async function customCsvExtra(
  entity: CustomEntity,
  object: string,
  policy: FieldPolicy | null,
  reserved: string[],
): Promise<{ headers: string[]; cells: (blob: string) => (string | number)[] }> {
  if (!canReadField(policy, object, "custom")) return { headers: [], cells: () => [] };
  const defs = (await customFieldDefsOf(entity)).filter((d) => !reserved.includes(d.key));
  return {
    headers: defs.map((d) => d.key),
    cells: (blob) => {
      const data = parseCustomBlob(blob);
      return defs.map((d) => customCsvCell(d.type, data[d.key]));
    },
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  return withAuth(req, async (auth) => {
    const { entity } = await params;
    const policy = await loadFieldPolicy(auth.role);

    let csv: string;
    if (entity === "contacts") {
      const denied = authorize(auth, "contacts", "read");
      if (denied) return denied;
      const headers = [
        "firstName",
        "lastName",
        "email",
        "phone",
        "jobTitle",
        "company",
        "status",
        "source",
        "score",
        "linkedin",
        "city",
        "country",
      ];
      const extra = await customCsvExtra("contact", "contacts", policy, headers);
      const allHeaders = [...headers, ...extra.headers];
      // Import already accepts a `company` name column; export the same header so a
      // round-trip re-links. Field perms still key off companyId.
      const visible = readableHeaders(policy, "contacts", allHeaders, { company: "companyId" });
      const [rows, companies] = await Promise.all([
        db.select().from(tables.contacts),
        db.select({ id: tables.companies.id, name: tables.companies.name }).from(tables.companies),
      ]);
      const companyById = new Map(companies.map((c) => [c.id, c.name]));
      csv = toCsv(
        visible,
        rows.map((r) =>
          project(allHeaders, visible, [
            r.firstName,
            r.lastName,
            r.email,
            r.phone,
            r.jobTitle,
            r.companyId ? (companyById.get(r.companyId) ?? "") : "",
            r.status,
            r.source,
            r.score,
            r.linkedin,
            r.city,
            r.country,
            ...extra.cells(r.custom),
          ]),
        ),
      );
    } else if (entity === "companies") {
      const denied = authorize(auth, "companies", "read");
      if (denied) return denied;
      const headers = ["name", "domain", "industry", "size", "website", "linkedin", "city", "country", "annualRevenue"];
      const extra = await customCsvExtra("company", "companies", policy, headers);
      const allHeaders = [...headers, ...extra.headers];
      const visible = readableHeaders(policy, "companies", allHeaders);
      const rows = await db.select().from(tables.companies);
      csv = toCsv(
        visible,
        rows.map((r) =>
          project(allHeaders, visible, [
            r.name,
            r.domain,
            r.industry,
            r.size,
            r.website,
            r.linkedin,
            r.city,
            r.country,
            r.annualRevenue,
            ...extra.cells(r.custom),
          ]),
        ),
      );
    } else if (entity === "deals") {
      const denied = authorize(auth, "deals", "read");
      if (denied) return denied;
      // Form/detail already expose pipeline + primary contact; export the same
      // headers so a multi-board workspace can tell stages apart. Field perms
      // still key off pipelineId / contactId.
      const headers = [
        "name",
        "amount",
        "currency",
        "pipeline",
        "stage",
        "company",
        "contact",
        "score",
        "expectedCloseDate",
        "closedAt",
      ];
      const extra = await customCsvExtra("deal", "deals", policy, headers);
      const allHeaders = [...headers, ...extra.headers];
      const visible = readableHeaders(policy, "deals", allHeaders, {
        pipeline: "pipelineId",
        stage: "stageId",
        company: "companyId",
        contact: "contactId",
      });
      const [rows, pipelines, stages, companies, contacts] = await Promise.all([
        db.select().from(tables.deals),
        db.select({ id: tables.pipelines.id, name: tables.pipelines.name }).from(tables.pipelines),
        db.select({ id: tables.stages.id, name: tables.stages.name }).from(tables.stages),
        db.select({ id: tables.companies.id, name: tables.companies.name }).from(tables.companies),
        db
          .select({
            id: tables.contacts.id,
            firstName: tables.contacts.firstName,
            lastName: tables.contacts.lastName,
          })
          .from(tables.contacts),
      ]);
      const pipelineById = new Map(pipelines.map((p) => [p.id, p.name]));
      const stageById = new Map(stages.map((s) => [s.id, s.name]));
      const companyById = new Map(companies.map((c) => [c.id, c.name]));
      const contactById = new Map(
        contacts.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ").trim()]),
      );
      csv = toCsv(
        visible,
        rows.map((r) =>
          project(allHeaders, visible, [
            r.name,
            r.amount,
            r.currency,
            pipelineById.get(r.pipelineId) ?? "",
            stageById.get(r.stageId) ?? "",
            r.companyId ? (companyById.get(r.companyId) ?? "") : "",
            r.contactId ? (contactById.get(r.contactId) ?? "") : "",
            r.score,
            r.expectedCloseDate ? new Date(r.expectedCloseDate).toISOString().slice(0, 10) : "",
            r.closedAt ? new Date(r.closedAt).toISOString().slice(0, 10) : "",
            ...extra.cells(r.custom),
          ]),
        ),
      );
    } else {
      return apiError("Unknown entity", 404);
    }

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="fourty-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });
}
