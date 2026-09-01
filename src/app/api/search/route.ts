import { withAuth, json } from "@/lib/api";
import { searchCrm } from "@/lib/services/search";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!q) return json({ results: [] });
    const hits = await searchCrm(q, { mode: "contains", limit: 5, role: auth.role });

    return json({
      results: [
        ...hits.contacts.map((c) => ({
          type: "contact",
          id: c.id,
          title: `${String(c.firstName ?? "")} ${String(c.lastName ?? "")}`.trim(),
          subtitle: (c.email as string | null | undefined) ?? (c.jobTitle as string | null | undefined) ?? null,
        })),
        ...hits.companies.map((c) => ({
          type: "company",
          id: c.id,
          title: c.name,
          subtitle: (c.domain as string | null | undefined) ?? (c.industry as string | null | undefined) ?? null,
        })),
        ...hits.deals.map((d) => {
          const amount = d.amount as number | undefined;
          const currency = d.currency as string | undefined;
          return {
            type: "deal",
            id: d.id,
            title: d.name,
            subtitle: amount != null ? `${currency ?? "USD"} ${amount.toLocaleString()}` : (currency ?? null),
          };
        }),
        ...hits.records.map((r) => ({
          type: r.object,
          id: r.id,
          title: r.title,
          subtitle: r.object,
        })),
      ],
    });
  });
}
