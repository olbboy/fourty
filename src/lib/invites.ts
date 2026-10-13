import { eq } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import { sha256 } from "@/lib/auth";

/**
 * An invite token is `${workspaceId}.${secret}`: the prefix names the workspace
 * whose RLS scope holds the invite, the whole token's hash identifies it.
 */
export function parseInviteToken(token: string): { workspaceId: string; tokenHash: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  return { workspaceId: token.slice(0, dot), tokenHash: sha256(token) };
}

type InviteRow = { acceptedAt: number | null; revokedAt: number | null; expiresAt: number };

/**
 * Where an invite stands: `used` once someone joined with it; `dead` when it
 * was taken back, replaced by a newer invite, or ran out; otherwise `live`.
 */
export function inviteState(invite: InviteRow, now = Date.now()): "live" | "used" | "dead" {
  if (invite.acceptedAt) return "used";
  if (invite.revokedAt || invite.expiresAt < now) return "dead";
  return "live";
}

/**
 * The address a live invite was sent to, or null. The accept
 * page shows it so a new member knows which email they will sign in with.
 */
export async function inviteEmail(token: string): Promise<string | null> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;
  return withWorkspace(parsed.workspaceId, async () => {
    const row = (
      await db
        .select({
          email: tables.invites.email,
          expiresAt: tables.invites.expiresAt,
          acceptedAt: tables.invites.acceptedAt,
          revokedAt: tables.invites.revokedAt,
        })
        .from(tables.invites)
        .where(eq(tables.invites.tokenHash, parsed.tokenHash))
        .limit(1)
    )[0];
    return row && inviteState(row) === "live" ? row.email : null;
  });
}
