import { desc } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json } from "@/lib/api";
import { toCsv } from "@/lib/csv";

// Read the workspace's audit log (admin only). RLS confines rows to the active
// workspace. `?format=csv` streams a CSV export; `?limit=` caps rows (max 1000).
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "audit", "read");
    if (denied) return denied;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);
    const rows = await db
      .select()
      .from(tables.auditLog)
      .orderBy(desc(tables.auditLog.createdAt))
      .limit(limit);

    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(
        ["created_at", "actor_id", "action", "object_type", "object_id", "meta"],
        rows.map((r) => [r.createdAt, r.actorId, r.action, r.objectType, r.objectId, r.meta]),
      );
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="audit-log.csv"',
        },
      });
    }
    return json({ entries: rows.map((r) => ({ ...r, meta: JSON.parse(r.meta) })) });
  });
}
