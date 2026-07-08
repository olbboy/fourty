import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { redactConnection } from "@/lib/sso/connection-view";

/** Read / update / delete one OIDC provider (Gate D4, ADR-014). Admin-only. */
type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return (
    await db.select().from(tables.ssoConnections).where(eq(tables.ssoConnections.id, id)).limit(1)
  )[0];
}

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sso", "read");
    if (denied) return denied;
    const { id } = await params;
    const row = await load(id);
    if (!row) return apiError("Connection not found", 404);
    return json({ connection: redactConnection(row) });
  });
}

const updateSchema = z
  .object({
    label: z.string().min(1).max(80),
    issuer: z.string().url().max(400),
    clientId: z.string().min(1).max(400),
    clientSecret: z.string().min(1).max(1000),
    scopes: z.string().min(1).max(400),
    enabled: z.boolean(),
    defaultWorkspaceId: z.string().max(40).nullable(),
    defaultRole: z.enum(["admin", "member", "viewer"]),
  })
  .partial();

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sso", "update");
    if (denied) return denied;
    const { id } = await params;
    const existing = await load(id);
    if (!existing) return apiError("Connection not found", 404);
    const body = await parseBody(req, updateSchema);
    if (!body.ok) return body.response;

    const d = body.data;
    const patch: Partial<typeof tables.ssoConnections.$inferInsert> = {};
    if (d.label !== undefined) patch.label = d.label;
    if (d.issuer !== undefined) patch.issuer = d.issuer.replace(/\/+$/, "");
    if (d.clientId !== undefined) patch.clientId = d.clientId;
    if (d.clientSecret !== undefined) patch.clientSecret = d.clientSecret; // rotate secret
    if (d.scopes !== undefined) patch.scopes = d.scopes;
    if (d.enabled !== undefined) patch.enabled = d.enabled ? 1 : 0;
    if (d.defaultWorkspaceId !== undefined) patch.defaultWorkspaceId = d.defaultWorkspaceId;
    if (d.defaultRole !== undefined) patch.defaultRole = d.defaultRole;

    if (Object.keys(patch).length > 0) {
      await db.update(tables.ssoConnections).set(patch).where(eq(tables.ssoConnections.id, id));
    }
    await audit(auth.user?.id, "sso_connection.updated", {
      objectType: "sso_connection",
      objectId: id,
      meta: { fields: Object.keys(patch) },
    });
    const row = await load(id);
    return json({ connection: redactConnection(row) });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sso", "delete");
    if (denied) return denied;
    const { id } = await params;
    const existing = await load(id);
    if (!existing) return apiError("Connection not found", 404);
    await db.delete(tables.ssoConnections).where(eq(tables.ssoConnections.id, id));
    await audit(auth.user?.id, "sso_connection.deleted", {
      objectType: "sso_connection",
      objectId: id,
      meta: { label: existing.label },
    });
    return json({ ok: true });
  });
}
