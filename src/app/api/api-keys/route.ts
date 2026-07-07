import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, apiError, parseBody } from "@/lib/api";
import { newId, newToken } from "@/lib/id";
import { sha256 } from "@/lib/auth";

// api_keys is looked up by hash during auth (before a workspace is known), so it
// is NOT RLS-protected — this route scopes it to the caller's workspace by hand.
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const rows = await db
      .select()
      .from(tables.apiKeys)
      .where(eq(tables.apiKeys.workspaceId, auth.workspaceId))
      .orderBy(desc(tables.apiKeys.createdAt));
    return json({
      keys: rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        lastUsedAt: r.lastUsedAt,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    if (auth.viaApiKey) return apiError("API keys cannot create API keys", 403);
    const body = await parseBody(req, z.object({ name: z.string().min(1).max(100) }));
    if (!body.ok) return body.response;

    const secret = `frty_${newToken(24)}`;
    const id = newId();
    // workspace_id is set explicitly (belt) and also defaults from the GUC.
    await db.insert(tables.apiKeys).values({
      id,
      workspaceId: auth.workspaceId,
      name: body.data.name,
      prefix: secret.slice(0, 12),
      keyHash: sha256(secret),
      createdAt: Date.now(),
    });
    // The full secret is returned exactly once
    return json({ id, name: body.data.name, secret }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return withAuth(req, async (auth) => {
    if (auth.viaApiKey) return apiError("API keys cannot revoke API keys", 403);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("Missing id");
    await db
      .update(tables.apiKeys)
      .set({ revokedAt: Date.now() })
      .where(and(eq(tables.apiKeys.id, id), eq(tables.apiKeys.workspaceId, auth.workspaceId)));
    return json({ ok: true });
  });
}
