import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId, newToken } from "@/lib/id";
import { sha256 } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { mailEnabled } from "@/lib/mail";
import { inviteEmail } from "@/lib/mail-templates";
import { log } from "@/lib/logger";

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

// Create a workspace invite (admin only). When SMTP is configured the link is
// emailed to the invitee; the token is returned either way, so an operator
// without mail (or whose mail is down) can still hand it over out of band. The
// token embeds the workspace id so /api/members/accept can resolve the
// workspace without a cross-tenant scan.
export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "members", "create");
    if (denied) return denied;
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;

    const id = newId();
    const token = `${auth.workspaceId}.${newToken(24)}`;
    const now = Date.now();
    const expiresAt = now + INVITE_TTL;
    const email = body.data.email.toLowerCase().trim();
    await db.insert(tables.invites).values({
      id,
      email,
      role: body.data.role,
      tokenHash: sha256(token),
      expiresAt,
      invitedBy: auth.user?.id ?? null,
      createdAt: now,
    });
    await audit(auth.user?.id, "member.invited", {
      objectType: "invite",
      objectId: id,
      meta: { email, role: body.data.role },
    });

    const emailed = await sendInviteEmail({
      req,
      workspaceId: auth.workspaceId,
      inviterId: auth.user?.id ?? null,
      to: email,
      role: body.data.role,
      token,
      expiresAt,
    });

    return json({ id, token, expiresAt, emailed }, { status: 201 });
  });
}

type InviteEmailArgs = {
  req: Request;
  workspaceId: string;
  inviterId: string | null;
  to: string;
  role: string;
  token: string;
  expiresAt: number;
};

/**
 * Queue the invite email. Returns whether one was enqueued, so the UI can say
 * "emailed" or fall back to showing the token. Never throws: a workspace or
 * mail failure must not cost the caller an invite that is already committed.
 */
async function sendInviteEmail(args: InviteEmailArgs): Promise<boolean> {
  if (!mailEnabled()) return false;
  try {
    return await queueInviteEmail(args);
  } catch (err) {
    // The invite row is already committed and the token is in the response, so
    // the admin can still deliver it by hand. Losing the email is a degraded
    // outcome, not a failed request.
    log().warn({ err, to: args.to }, "invite email could not be queued");
    return false;
  }
}

async function queueInviteEmail(args: InviteEmailArgs): Promise<boolean> {
  const workspace = (
    await db
      .select({ name: tables.workspaces.name })
      .from(tables.workspaces)
      .where(eq(tables.workspaces.id, args.workspaceId))
      .limit(1)
  )[0];

  const inviter = args.inviterId
    ? (
        await db
          .select({ name: tables.users.name })
          .from(tables.users)
          .where(eq(tables.users.id, args.inviterId))
          .limit(1)
      )[0]
    : undefined;

  // Same origin the admin is using, so the link works on whatever hostname
  // this instance is actually reached at — no APP_URL to keep in sync.
  const origin = new URL(args.req.url).origin;
  const acceptUrl = `${origin}/accept?token=${encodeURIComponent(args.token)}`;

  const message = inviteEmail({
    workspaceName: workspace?.name ?? "Fourty",
    inviterName: inviter?.name ?? null,
    role: args.role,
    acceptUrl,
    expiresAt: args.expiresAt,
  });

  // Note the asymmetry with `invites.tokenHash`: the queued job carries the raw
  // token, so it sits in the pgboss tables until the job is archived. That is
  // not an escalation — anyone who can read those tables can read `sessions`
  // too — but it does mean the hash in `invites` is not the only copy, and a
  // long queue backlog keeps live tokens around longer than the send itself.
  await enqueue("mail.send", { to: args.to, ...message }, { workspaceId: args.workspaceId });
  return true;
}
