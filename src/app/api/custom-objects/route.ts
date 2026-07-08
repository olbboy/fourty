import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";
import { API_NAME_RE } from "@/lib/records";
import { listObjects } from "@/lib/custom-objects";

const RESERVED = new Set([
  "contacts",
  "companies",
  "deals",
  "tasks",
  "notes",
  "activities",
  "pipelines",
  "stages",
  "workflows",
]);

const input = z.object({
  apiName: z.string().min(2).max(40).regex(API_NAME_RE, "lowercase letters, digits, underscores; must start with a letter"),
  nameSingular: z.string().min(1).max(60),
  namePlural: z.string().min(1).max(60),
  icon: z.string().max(40).optional().default("Box"),
  description: z.string().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  return withAuth(req, async () => {
    return json({ objects: await listObjects() });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-objects", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    if (RESERVED.has(body.data.apiName)) {
      return json({ error: "That api name is reserved by a built-in object" }, { status: 409 });
    }
    const clash = (
      await db
        .select({ id: tables.customObjects.id })
        .from(tables.customObjects)
        .where(eq(tables.customObjects.apiName, body.data.apiName))
        .limit(1)
    )[0];
    if (clash) return json({ error: "An object with this api name already exists" }, { status: 409 });

    const id = newId();
    await db.insert(tables.customObjects).values({
      id,
      apiName: body.data.apiName,
      nameSingular: body.data.nameSingular,
      namePlural: body.data.namePlural,
      icon: body.data.icon,
      description: body.data.description ?? null,
      createdAt: Date.now(),
    });
    await audit(auth.user?.id, "custom_object.created", { objectType: "custom_object", objectId: id });
    const row = (
      await db.select().from(tables.customObjects).where(eq(tables.customObjects.id, id)).limit(1)
    )[0]!;
    return json({ object: row }, { status: 201 });
  });
}
