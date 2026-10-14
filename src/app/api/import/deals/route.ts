import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, tables, withSavepoint } from "@/db";
import { withAuth, authorize, json, apiError } from "@/lib/api";
import { parseCsvObjects } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { customFieldDefsOf } from "@/lib/custom-fields";
import { loadReportingSettings } from "@/lib/reporting";
import { planDealImport, type ImportLookups } from "@/lib/import-deals";
import { execute } from "@/lib/actions/execute";
import { dealsCreate } from "@/lib/actions/deals";
import { companiesCreate } from "@/lib/actions/companies";
import { ActionError } from "@/lib/actions/types";

const MAX_ROWS = 1000;

/**
 * Deals from a CSV (D14). `?dryRun=1` answers what every row would become
 * and what is wrong, writing nothing. Without it, every row is created or
 * none is: a wrong row refuses the file, and each deal goes through
 * deals.create (timeline, audit, score, workflows) inside one savepoint, so a
 * refusal half-way undoes the rows before it.
 */
export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "deals", "create");
    if (denied) return denied;

    const text = await req.text();
    if (!text.trim()) return apiError("Empty file");
    const rows = parseCsvObjects(text);
    if (rows.length === 0) return apiError("No data rows found — is the first row a header?");
    if (rows.length > MAX_ROWS) return apiError(`Too many rows (max ${MAX_ROWS})`);

    const plan = planDealImport(rows, await lookups());
    const invalid = plan.filter((row) => row.error).length;
    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    if (dryRun) {
      return json({ rows: plan, valid: plan.length - invalid, invalid, companiesToCreate: new Set(plan.filter((r) => r.newCompany).map((r) => r.company)).size });
    }
    if (invalid) return json({ error: `${invalid} of ${plan.length} rows cannot be imported; nothing was`, rows: plan }, { status: 400 });

    const ctx = { workspaceId: auth.workspaceId, role: auth.role, userId: auth.user?.id ?? null };
    try {
      const companiesCreated = await withSavepoint(async () => {
        const made = new Map<string, string>();
        for (const row of plan) {
          let companyId = row.companyId;
          if (row.newCompany && row.company) {
            const key = row.company.toLowerCase();
            if (!made.has(key)) made.set(key, ((await execute(companiesCreate, { name: row.company }, ctx)) as { id: string }).id);
            companyId = made.get(key)!;
          }
          await execute(
            dealsCreate,
            {
              name: row.name,
              ...(row.amount !== null ? { amount: row.amount } : {}),
              currency: row.currency,
              pipelineId: row.pipelineId,
              ...(row.stageId ? { stageId: row.stageId } : {}),
              companyId,
              contactId: row.contactId,
              expectedCloseDate: row.expectedCloseDate,
              ...(row.ownerId ? { ownerId: row.ownerId } : {}),
              ...(Object.keys(row.custom).length ? { custom: row.custom } : {}),
            },
            ctx,
          );
        }
        return made.size;
      });
      await audit(auth.user?.id, "deals.imported", { objectType: "deal", objectId: "import", meta: { created: plan.length, companiesCreated } });
      return json({ created: plan.length, companiesCreated, total: plan.length });
    } catch (err) {
      if (err instanceof ActionError) return apiError(`Nothing was imported: ${err.message}`, err.kind === "forbidden" ? 403 : 400);
      throw err;
    }
  });
}

/** What the rows are matched against, read once for the whole file. */
async function lookups(): Promise<ImportLookups> {
  const pipelines = await db.select().from(tables.pipelines).orderBy(desc(tables.pipelines.isDefault), asc(tables.pipelines.createdAt));
  const stages = await db.select().from(tables.stages).orderBy(asc(tables.stages.order));
  const members = await db
    .select({ id: tables.users.id, name: tables.users.name, email: tables.users.email })
    .from(tables.workspaceMembers)
    .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
    // workspace_members has no row-level security: scope it the way RLS would.
    .where(and(isNull(tables.workspaceMembers.deactivatedAt), eq(tables.workspaceMembers.workspaceId, sql`current_setting('app.workspace_id', true)`)));
  const companies = await db.select({ id: tables.companies.id, name: tables.companies.name }).from(tables.companies);
  const contacts = await db
    .select({ id: tables.contacts.id, email: tables.contacts.email, firstName: tables.contacts.firstName, lastName: tables.contacts.lastName })
    .from(tables.contacts);
  return {
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, stages: stages.filter((s) => s.pipelineId === p.id).map((s) => ({ id: s.id, name: s.name })) })),
    members,
    companies,
    contacts: contacts.map((c) => ({ id: c.id, email: c.email, name: `${c.firstName} ${c.lastName}`.trim() })),
    defaultCurrency: (await loadReportingSettings()).currency,
    dealFields: await customFieldDefsOf("deal"),
  };
}
