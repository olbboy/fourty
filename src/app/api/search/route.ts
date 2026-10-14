import { withAuth, authorize, json } from "@/lib/api";
import { searchCrm } from "@/lib/services/search";
import { canReadField, loadFieldPolicy, type FieldPolicy } from "@/lib/field-permissions";

type SearchResult = {
  type: "contact" | "company" | "deal" | string;
  id: string;
  title: string;
  subtitle: string | null;
};

const RESULT_LIMIT = 5;

function wildcardOnly(q: string): boolean {
  return !q.trim().replace(/[%_]/g, "");
}

function contactResult(policy: FieldPolicy | null, row: Record<string, unknown>): SearchResult | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id || !canReadField(policy, "contacts", "id")) return null;
  const nameParts = [
    canReadField(policy, "contacts", "firstName") ? row.firstName : null,
    canReadField(policy, "contacts", "lastName") ? row.lastName : null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  const title = nameParts.join(" ").trim();
  if (!title) return null;

  const subtitle =
    (canReadField(policy, "contacts", "email") && typeof row.email === "string" && row.email) ||
    (canReadField(policy, "contacts", "jobTitle") && typeof row.jobTitle === "string" && row.jobTitle) ||
    null;
  return { type: "contact", id, title, subtitle };
}

function companyResult(policy: FieldPolicy | null, row: Record<string, unknown>): SearchResult | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id || !canReadField(policy, "companies", "id")) return null;
  const title = canReadField(policy, "companies", "name") && typeof row.name === "string" ? row.name.trim() : "";
  if (!title) return null;

  const subtitle =
    (canReadField(policy, "companies", "domain") && typeof row.domain === "string" && row.domain) ||
    (canReadField(policy, "companies", "industry") && typeof row.industry === "string" && row.industry) ||
    null;
  return { type: "company", id, title, subtitle };
}

function dealResult(policy: FieldPolicy | null, row: Record<string, unknown>): SearchResult | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id || !canReadField(policy, "deals", "id") || !canReadField(policy, "deals", "name")) return null;
  const title = typeof row.name === "string" ? row.name.trim() : "";
  if (!title) return null;

  const subtitle =
    canReadField(policy, "deals", "amount") && canReadField(policy, "deals", "currency")
      ? `${typeof row.currency === "string" ? row.currency : ""} ${typeof row.amount === "number" ? row.amount.toLocaleString() : Number(row.amount).toLocaleString()}`.trim()
      : null;
  return { type: "deal", id, title, subtitle };
}

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    // Search spans three CRM objects; keep the same read gates as their list
    // surfaces while preserving the established `{ results }` response shape.
    for (const object of ["contacts", "companies", "deals"] as const) {
      const denied = authorize(auth, object, "read");
      if (denied) return denied;
    }

    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!q || wildcardOnly(q)) return json({ results: [] });

    const policy = await loadFieldPolicy(auth.role);
    const hits = await searchCrm(q, { mode: "contains", limit: RESULT_LIMIT, role: auth.role });

    // A record found by its notes shows the words that matched instead of its usual subtitle.
    const fromNote = new Map((hits.notes ?? []).map((n) => [n.entityId, `“${n.excerpt}”`]));
    const withNote = (row: SearchResult | null): SearchResult | null =>
      row && fromNote.has(row.id) ? { ...row, subtitle: fromNote.get(row.id)! } : row;
    return json({
      results: [
        ...hits.contacts.map((row) => withNote(contactResult(policy, row))).filter((row): row is SearchResult => row !== null),
        ...hits.companies.map((row) => withNote(companyResult(policy, row))).filter((row): row is SearchResult => row !== null),
        ...hits.deals.map((row) => withNote(dealResult(policy, row))).filter((row): row is SearchResult => row !== null),
        ...hits.records.map((record) => ({
          type: record.object,
          id: record.id,
          title: record.title,
          subtitle: record.object,
        })),
      ],
    });
  });
}
