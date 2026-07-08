import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/id";
import { redactConnection } from "@/lib/sso/connection-view";

/**
 * Manage instance-level OIDC providers (Gate D4, ADR-014). Admin-only ("sso" is
 * an administration object). Connections are global (identity plane), so reads
 * return every connection regardless of the caller's workspace; the client secret
 * is never returned — only whether one is set.
 */

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sso", "read");
    if (denied) return denied;
    const rows = await db.select().from(tables.ssoConnections);
    return json({ connections: rows.map(redactConnection) });
  });
}

const createSchema = z.object({
  label: z.string().min(1).max(80),
  issuer: z.string().url().max(400),
  clientId: z.string().min(1).max(400),
  clientSecret: z.string().min(1).max(1000),
  scopes: z.string().min(1).max(400).optional(),
  enabled: z.boolean().optional(),
  defaultWorkspaceId: z.string().max(40).nullable().optional(),
  defaultRole: z.enum(["admin", "member", "viewer"]).optional(),
});

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sso", "create");
    if (denied) return denied;
    const body = await parseBody(req, createSchema);
    if (!body.ok) return body.response;

    const id = newId();
    await db.insert(tables.ssoConnections).values({
      id,
      label: body.data.label,
      issuer: body.data.issuer.replace(/\/+$/, ""),
      clientId: body.data.clientId,
      clientSecret: body.data.clientSecret,
      scopes: body.data.scopes ?? "openid email profile",
      enabled: body.data.enabled === false ? 0 : 1,
      defaultWorkspaceId: body.data.defaultWorkspaceId ?? null,
      defaultRole: body.data.defaultRole ?? "member",
      createdAt: Date.now(),
    });
    await audit(auth.user?.id, "sso_connection.created", {
      objectType: "sso_connection",
      objectId: id,
      meta: { label: body.data.label, issuer: body.data.issuer },
    });
    const row = (
      await db.select().from(tables.ssoConnections).where(eq(tables.ssoConnections.id, id)).limit(1)
    )[0];
    return json({ connection: redactConnection(row) }, { status: 201 });
  });
}
