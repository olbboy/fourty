import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError, parseBody } from "@/lib/api";
import { newId, newToken } from "@/lib/id";
import { sha256 } from "@/lib/auth";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const rows = db.select().from(tables.apiKeys).orderBy(desc(tables.apiKeys.createdAt)).all();
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
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  if (auth.viaApiKey) return apiError("API keys cannot create API keys", 403);
  const body = await parseBody(req, z.object({ name: z.string().min(1).max(100) }));
  if (!body.ok) return body.response;

  const secret = `frty_${newToken(24)}`;
  const id = newId();
  db.insert(tables.apiKeys)
    .values({
      id,
      name: body.data.name,
      prefix: secret.slice(0, 12),
      keyHash: sha256(secret),
      createdAt: Date.now(),
    })
    .run();
  // The full secret is returned exactly once
  return json({ id, name: body.data.name, secret }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  if (auth.viaApiKey) return apiError("API keys cannot revoke API keys", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError("Missing id");
  db.update(tables.apiKeys).set({ revokedAt: Date.now() }).where(eq(tables.apiKeys.id, id)).run();
  return json({ ok: true });
}
