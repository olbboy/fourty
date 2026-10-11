import { asc, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, apiError } from "@/lib/api";
import { toSpreadsheetCsv, type CsvCell } from "@/lib/csv";
import {
  companyOrderBy,
  companyQueryPolicy,
  companyWhere,
  normalizeCompanyQuery,
  parseSelectedCompanyIds,
} from "@/lib/company-query";
import { canReadField, loadFieldPolicy, type FieldPolicy } from "@/lib/field-permissions";

type ExportEntity = "contacts" | "companies" | "deals";
type ExportScope = "all" | "filtered" | "selected";

type Column<Row> = {
  header: string;
  field: string;
  value: (row: Row, stages?: Map<string, string>) => CsvCell;
};

const CONTACT_COLUMNS: Column<typeof tables.contacts.$inferSelect>[] = [
  { header: "firstName", field: "firstName", value: (row) => row.firstName },
  { header: "lastName", field: "lastName", value: (row) => row.lastName },
  { header: "email", field: "email", value: (row) => row.email },
  { header: "phone", field: "phone", value: (row) => row.phone },
  { header: "jobTitle", field: "jobTitle", value: (row) => row.jobTitle },
  { header: "status", field: "status", value: (row) => row.status },
  { header: "source", field: "source", value: (row) => row.source },
  { header: "score", field: "score", value: (row) => row.score },
  { header: "linkedin", field: "linkedin", value: (row) => row.linkedin },
  { header: "city", field: "city", value: (row) => row.city },
  { header: "country", field: "country", value: (row) => row.country },
];

const COMPANY_COLUMNS: Column<typeof tables.companies.$inferSelect>[] = [
  { header: "name", field: "name", value: (row) => row.name },
  { header: "domain", field: "domain", value: (row) => row.domain },
  { header: "industry", field: "industry", value: (row) => row.industry },
  { header: "size", field: "size", value: (row) => row.size },
  { header: "website", field: "website", value: (row) => row.website },
  { header: "city", field: "city", value: (row) => row.city },
  { header: "country", field: "country", value: (row) => row.country },
  { header: "annualRevenue", field: "annualRevenue", value: (row) => row.annualRevenue },
];

const DEAL_COLUMNS: Column<typeof tables.deals.$inferSelect>[] = [
  { header: "name", field: "name", value: (row) => row.name },
  { header: "amount", field: "amount", value: (row) => row.amount },
  { header: "currency", field: "currency", value: (row) => row.currency },
  // `stage` is derived from stageId; both names are honored for policy rules so
  // a workspace cannot hide one representation and still receive the other.
  { header: "stage", field: "stageId", value: (row, stages) => stages?.get(row.stageId) ?? "" },
  {
    header: "expectedCloseDate",
    field: "expectedCloseDate",
    value: (row) => (row.expectedCloseDate ? new Date(row.expectedCloseDate).toISOString().slice(0, 10) : ""),
  },
  {
    header: "closedAt",
    field: "closedAt",
    value: (row) => (row.closedAt ? new Date(row.closedAt).toISOString().slice(0, 10) : ""),
  },
];

function isExportEntity(entity: string): entity is ExportEntity {
  return entity === "contacts" || entity === "companies" || entity === "deals";
}

function isExportScope(scope: string): scope is ExportScope {
  return scope === "all" || scope === "filtered" || scope === "selected";
}

function readableColumns<Row>(policy: FieldPolicy | null, object: string, columns: Column<Row>[]): Column<Row>[] {
  return columns.filter((column) => {
    if (!canReadField(policy, object, column.field)) return false;
    return column.field !== "stageId" || canReadField(policy, object, "stage");
  });
}

function serializeColumns<Row>(
  policy: FieldPolicy | null,
  object: string,
  columns: Column<Row>[],
  rows: Row[],
  stages?: Map<string, string>,
): string {
  const readable = readableColumns(policy, object, columns);
  return toSpreadsheetCsv(
    readable.map((column) => column.header),
    rows.map((row) => readable.map((column) => column.value(row, stages))),
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  return withAuth(req, async (auth) => {
    const { entity } = await params;
    if (!isExportEntity(entity)) return apiError("Unknown entity", 404);

    // Export is governed by two independent gates: the export surface itself and
    // the concrete CRM object. Keep both calls visible at this boundary.
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
      // A selected export uses caller-supplied IDs as a lookup key. If the
      // caller cannot read `id`, accepting that scope would let a known ID
      // reveal other readable fields. All-scope export remains valid because
      // it does not expose or accept IDs.
      if (scope === "selected" && !canReadField(policy, "companies", "id")) {
        return apiError("Forbidden: company selection is not readable", 403);
      }
      let csv: string;
      if (entity === "companies") {
        // Export is unpaginated by contract. Ignore list pagination copied into
        // an export URL so offset/limit cannot silently alter its scope.
        const exportQueryParams = new URLSearchParams(searchParams);
        exportQueryParams.delete("offset");
        exportQueryParams.delete("limit");
        const normalized = normalizeCompanyQuery(exportQueryParams);
        if (!normalized.ok) return apiError(normalized.message, 400);

        // `all` deliberately ignores q/industry, while still using the shared
        // sort/policy path so a hidden default sort falls back to id order.
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
        csv = serializeColumns(policy, "companies", COMPANY_COLUMNS, rows);
      } else if (entity === "contacts") {
        const rows = await db.select().from(tables.contacts).orderBy(asc(tables.contacts.id));
        csv = serializeColumns(policy, "contacts", CONTACT_COLUMNS, rows);
      } else {
        const stagesNeeded = canReadField(policy, "deals", "stageId") && canReadField(policy, "deals", "stage");
        const stages = stagesNeeded
          ? new Map((await db.select().from(tables.stages)).map((stage) => [stage.id, stage.name]))
          : undefined;
        const rows = await db.select().from(tables.deals).orderBy(asc(tables.deals.id));
        csv = serializeColumns(policy, "deals", DEAL_COLUMNS, rows, stages);
      }

      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="fourty-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    } catch {
      // A failed validation/auth/query path must remain JSON, never a CSV that
      // looks like a successful download.
      return apiError("Export failed", 500);
    }
  });
}
