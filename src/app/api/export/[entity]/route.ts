import { asc, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, apiError, authorize } from "@/lib/api";
import { toSpreadsheetCsv, type CsvCell } from "@/lib/csv";
import { customFieldDefsOf, parseCustomBlob, type CustomEntity } from "@/lib/custom-fields";
import {
  companyOrderBy,
  companyQueryPolicy,
  companyWhere,
  normalizeCompanyQuery,
  parseSelectedCompanyIds,
} from "@/lib/company-query";
import { canReadField, loadFieldPolicy, redact, type FieldPolicy } from "@/lib/field-permissions";

type ExportEntity = "contacts" | "companies" | "deals";
type ExportScope = "all" | "filtered" | "selected";
type HeaderFields = Record<string, string>;

/** Keep derived CSV names tied to the stored field used by field permissions. */
function readableHeaders(
  policy: FieldPolicy | null,
  object: string,
  headers: string[],
  fields: HeaderFields = {},
): string[] {
  const sample = Object.fromEntries(headers.map((header) => [fields[header] ?? header, true]));
  const kept = redact(policy, object, sample);
  return headers.filter((header) => (fields[header] ?? header) in kept);
}

function project(
  headers: string[],
  visible: string[],
  values: CsvCell[],
): CsvCell[] {
  const byName = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  return visible.map((header) => byName[header]);
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
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

/** Append current custom-field definitions while keeping the stored blob private. */
async function customCsvExtra(
  entity: CustomEntity,
  object: string,
  policy: FieldPolicy | null,
  reserved: string[],
): Promise<{ headers: string[]; cells: (blob: string) => (string | number)[] }> {
  if (!canReadField(policy, object, "custom")) return { headers: [], cells: () => [] };
  const defs = (await customFieldDefsOf(entity)).filter((definition) => !reserved.includes(definition.key));
  return {
    headers: defs.map((definition) => definition.key),
    cells: (blob) => {
      const data = parseCustomBlob(blob);
      return defs.map((definition) => customCsvCell(definition.type, data[definition.key]));
    },
  };
}

function isExportEntity(entity: string): entity is ExportEntity {
  return entity === "contacts" || entity === "companies" || entity === "deals";
}

function isExportScope(scope: string): scope is ExportScope {
  return scope === "all" || scope === "filtered" || scope === "selected";
}

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  return withAuth(req, async (auth) => {
    const { entity } = await params;
    if (!isExportEntity(entity)) return apiError("Unknown entity", 404);

    // Keep the export-surface and concrete-object gates independent. Both are
    // part of the public authorization contract for this endpoint.
    const exportDenied = authorize(auth, "export", "read");
    if (exportDenied) return exportDenied;
    const entityDenied = authorize(auth, entity, "read");
    if (entityDenied) return entityDenied;

    const searchParams = new URL(req.url).searchParams;
    const scope = searchParams.get("scope") ?? "all";
    if (!isExportScope(scope)) return apiError("Invalid export scope", 400);
    if (entity !== "companies" && scope !== "all") {
      return apiError(`${entity} exports only support scope=all`, 400);
    }

    let selectedIds: string[] = [];
    if (scope === "selected") {
      try {
        selectedIds = parseSelectedCompanyIds(searchParams);
      } catch {
        return apiError("Selected company export is limited to 500 IDs", 400);
      }
      if (!selectedIds.length) return apiError("Selected company export requires at least one ID", 400);
    }

    try {
      const policy = await loadFieldPolicy(auth.role);
      // Selected ids are caller-supplied lookup keys. Requiring id visibility
      // prevents a hidden id from becoming a row-existence oracle.
      if (scope === "selected" && !canReadField(policy, "companies", "id")) {
        return apiError("Forbidden: company selection is not readable", 403);
      }

      let csv: string;
      if (entity === "contacts") {
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
        // Import accepts a company name, while permissions remain keyed by
        // companyId because that is the value stored on the contact row.
        const visible = readableHeaders(policy, "contacts", allHeaders, { company: "companyId" });
        const [rows, companies] = await Promise.all([
          db.select().from(tables.contacts),
          db.select({ id: tables.companies.id, name: tables.companies.name }).from(tables.companies),
        ]);
        const companyById = new Map(companies.map((company) => [company.id, company.name]));
        csv = toSpreadsheetCsv(
          visible,
          rows.map((row) =>
            project(allHeaders, visible, [
              row.firstName,
              row.lastName,
              row.email,
              row.phone,
              row.jobTitle,
              row.companyId ? (companyById.get(row.companyId) ?? "") : "",
              row.status,
              row.source,
              row.score,
              row.linkedin,
              row.city,
              row.country,
              ...extra.cells(row.custom),
            ]),
          ),
        );
      } else if (entity === "companies") {
        // Export is deliberately unpaged. Strip list pagination copied into an
        // export URL while retaining filters, sort and field-policy checks.
        const exportQueryParams = new URLSearchParams(searchParams);
        exportQueryParams.delete("offset");
        exportQueryParams.delete("limit");
        const normalized = normalizeCompanyQuery(exportQueryParams);
        if (!normalized.ok) return apiError(normalized.message, 400);

        // scope=all ignores q/industry; filtered and selected still validate
        // the complete query so hidden filters cannot become an oracle.
        const query = scope === "all"
          ? { ...normalized.value, q: undefined, industry: undefined }
          : normalized.value;
        const queryPolicy = companyQueryPolicy(query, policy);
        if (!queryPolicy.ok) return apiError(queryPolicy.message, queryPolicy.status);

        const where = scope === "selected"
          ? inArray(tables.companies.id, selectedIds)
          : scope === "filtered"
            ? companyWhere(query, queryPolicy.searchFields)
            : undefined;
        const rows = await db
          .select()
          .from(tables.companies)
          .where(where)
          .orderBy(...companyOrderBy(queryPolicy.effectiveSort));

        const headers = [
          "name",
          "domain",
          "industry",
          "size",
          "website",
          "linkedin",
          "city",
          "country",
          "annualRevenue",
        ];
        const extra = await customCsvExtra("company", "companies", policy, headers);
        const allHeaders = [...headers, ...extra.headers];
        const visible = readableHeaders(policy, "companies", allHeaders);
        csv = toSpreadsheetCsv(
          visible,
          rows.map((row) =>
            project(allHeaders, visible, [
              row.name,
              row.domain,
              row.industry,
              row.size,
              row.website,
              row.linkedin,
              row.city,
              row.country,
              row.annualRevenue,
              ...extra.cells(row.custom),
            ]),
          ),
        );
      } else {
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
          db.select({ id: tables.contacts.id, firstName: tables.contacts.firstName, lastName: tables.contacts.lastName }).from(tables.contacts),
        ]);
        const pipelineById = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));
        const stageById = new Map(stages.map((stage) => [stage.id, stage.name]));
        const companyById = new Map(companies.map((company) => [company.id, company.name]));
        const contactById = new Map(
          contacts.map((contact) => [contact.id, [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()]),
        );
        csv = toSpreadsheetCsv(
          visible,
          rows.map((row) =>
            project(allHeaders, visible, [
              row.name,
              row.amount,
              row.currency,
              pipelineById.get(row.pipelineId) ?? "",
              stageById.get(row.stageId) ?? "",
              row.companyId ? (companyById.get(row.companyId) ?? "") : "",
              row.contactId ? (contactById.get(row.contactId) ?? "") : "",
              row.score,
              row.expectedCloseDate ? new Date(row.expectedCloseDate).toISOString().slice(0, 10) : "",
              row.closedAt ? new Date(row.closedAt).toISOString().slice(0, 10) : "",
              ...extra.cells(row.custom),
            ]),
          ),
        );
      }

      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="fourty-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    } catch {
      // Validation, authorization and query failures stay JSON instead of
      // being mistaken for a successful CSV download.
      return apiError("Export failed", 500);
    }
  });
}
