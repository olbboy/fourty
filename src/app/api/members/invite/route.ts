import { z } from "zod";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId, newToken } from "@/lib/id";
import { sha256 } from "@/lib/auth";
import { audit } from "@/lib/audit";

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

// Create a workspace invite (admin only). Returns the one-time token; delivering
// it by email is a later concern (B4). The token embeds the workspace id so
// /api/members/accept can resolve the workspace without a cross-tenant scan.
export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "members", "create");
    if (denied) return denied;
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;

    const id = newId();
    const token = `${auth.workspaceId}.${newToken(24)}`;
    const now = Date.now();
    await db.insert(tables.invites).values({
      id,
      email: body.data.email.toLowerCase().trim(),
      role: body.data.role,
      tokenHash: sha256(token),
      expiresAt: now + INVITE_TTL,
      invitedBy: auth.user?.id ?? null,
      createdAt: now,
    });
    await audit(auth.user?.id, "member.invited", {
      objectType: "invite",
      objectId: id,
      meta: { email: body.data.email, role: body.data.role },
    });
    return json({ id, token, expiresAt: now + INVITE_TTL }, { status: 201 });
  });
}
