import { db, tables } from "@/db";
import { withAuth, apiError } from "@/lib/api";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  return withAuth(req, async (auth) => {
  const { entity } = await params;

  let csv: string;
  if (entity === "contacts") {
    const rows = await db.select().from(tables.contacts);
    csv = toCsv(
      ["firstName", "lastName", "email", "phone", "jobTitle", "status", "source", "score", "linkedin", "city", "country"],
      rows.map((r) => [r.firstName, r.lastName, r.email, r.phone, r.jobTitle, r.status, r.source, r.score, r.linkedin, r.city, r.country]),
    );
  } else if (entity === "companies") {
    const rows = await db.select().from(tables.companies);
    csv = toCsv(
      ["name", "domain", "industry", "size", "website", "city", "country", "annualRevenue"],
      rows.map((r) => [r.name, r.domain, r.industry, r.size, r.website, r.city, r.country, r.annualRevenue]),
    );
  } else if (entity === "deals") {
    const stages = new Map((await db.select().from(tables.stages)).map((s) => [s.id, s.name]));
    const rows = await db.select().from(tables.deals);
    csv = toCsv(
      ["name", "amount", "currency", "stage", "expectedCloseDate", "closedAt"],
      rows.map((r) => [
        r.name,
        r.amount,
        r.currency,
        stages.get(r.stageId) ?? "",
        r.expectedCloseDate ? new Date(r.expectedCloseDate).toISOString().slice(0, 10) : "",
        r.closedAt ? new Date(r.closedAt).toISOString().slice(0, 10) : "",
      ]),
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
