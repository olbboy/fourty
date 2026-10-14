import { z } from "zod";
import { and, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError } from "@/lib/api";
import { toSpreadsheetCsv } from "@/lib/csv";

const query = z.object({
  // A number that isn't one means the default; a larger one means the most.
  limit: z.coerce.number().int().catch(200).transform((n) => Math.min(Math.max(n, 1), 1000)),
  /** One person. */
  actorId: z.string().min(1).max(64).optional(),
  /** "deal.updated" exactly, "deal." for every action on deals, ".deleted" for every deletion. */
  action: z.string().min(1).max(80).optional(),
  /** Epoch ms, inclusive. */
  from: z.coerce.number().int().min(0).optional(),
  to: z.coerce.number().int().min(0).optional(),
  format: z.enum(["csv", "json"]).optional(),
});

// Read the workspace's audit log (admin only). RLS confines rows to the active
// workspace. Filters (D18): `actorId`, `action` (exact; "deal." for one kind of
// record; ".deleted" for one kind of action), `from`/`to` (epoch ms).
// `?format=csv` downloads them with who acted by name and email, safe to open in
// a spreadsheet; `?limit=` caps rows (max 1000).
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "audit", "read");
    if (denied) return denied;
    const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return apiError(`${issue.path.join(".")}: ${issue.message}`);
    }
    const q = parsed.data;
    const where: SQL[] = [];
    if (q.actorId) where.push(eq(tables.auditLog.actorId, q.actorId));
    if (q.action) where.push(actionIs(q.action));
    if (q.from !== undefined) where.push(gte(tables.auditLog.createdAt, q.from));
    if (q.to !== undefined) where.push(lte(tables.auditLog.createdAt, q.to));
    const rows = await db
      .select()
      .from(tables.auditLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tables.auditLog.createdAt))
      .limit(q.limit);

    if (q.format === "csv") {
      // users carries no row-level security: read only the people these rows name.
      const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
      const people = actorIds.length
        ? await db.select({ id: tables.users.id, name: tables.users.name, email: tables.users.email }).from(tables.users).where(inArray(tables.users.id, actorIds))
        : [];
      const byId = new Map(people.map((p) => [p.id, p]));
      // Names are typed by people: a name beginning "=" must stay text.
      const csv = toSpreadsheetCsv(
        ["created_at", "actor_id", "actor_name", "actor_email", "action", "object_type", "object_id", "meta"],
        rows.map((r) => [
          r.createdAt,
          r.actorId,
          r.actorId ? (byId.get(r.actorId)?.name ?? "") : "",
          r.actorId ? (byId.get(r.actorId)?.email ?? "") : "",
          r.action,
          r.objectType,
          r.objectId,
          r.meta,
        ]),
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

/** LIKE treats % and _ as wildcards; "api_key." means those letters. */
const literal = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function actionIs(action: string): SQL {
  const column = tables.auditLog.action;
  if (action.startsWith(".")) return like(column, `%${literal(action)}`);
  if (!action.endsWith(".")) return eq(column, action);
  // A kind of record also takes in what was done to many at once
  // ("contact." finds contacts.imported).
  const kind = action.slice(0, -1);
  return or(like(column, `${literal(kind)}.%`), like(column, `${literal(kind)}s.%`))!;
}
