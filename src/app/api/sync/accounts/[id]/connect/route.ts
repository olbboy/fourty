import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, apiError } from "@/lib/api";
import {
  clientFromEnv,
  buildConsentUrl,
  generatePkce,
  randomState,
  SYNC_OAUTH_COOKIE,
  type MailProvider,
} from "@/lib/sync/oauth";

/**
 * Start the OAuth connect for a mailbox account (Gate C6 completion, ADR-009).
 * Authenticated (sync:update) — mints PKCE + a one-time state (stored in an
 * httpOnly cookie for CSRF), then redirects the browser to the provider consent
 * screen. The instance's OAuth client credentials come from env, not the account.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATE_TTL_SECONDS = 600;

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "update");
    if (denied) return denied;
    const { id } = await params;
    const account = (
      await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
    )[0];
    if (!account) return apiError("Account not found", 404);
    if (account.provider !== "google" && account.provider !== "microsoft") {
      return apiError(`OAuth connect is not supported for provider '${account.provider}'`, 400);
    }
    const provider = account.provider as MailProvider;
    const client = clientFromEnv(provider);
    if (!client) return apiError(`OAuth client for '${provider}' is not configured on this instance`, 400);

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/sync/accounts/${id}/oauth/callback`;
    const { verifier, challenge } = generatePkce();
    const state = randomState();
    const consentUrl = buildConsentUrl(provider, client, {
      redirectUri,
      state,
      codeChallenge: challenge,
      loginHint: account.email,
    });

    const res = NextResponse.redirect(consentUrl, 302);
    // Bind the flow to this account + state; the callback verifies both before
    // exchanging the code. base64url state/verifier contain no ':' so the triple
    // splits cleanly.
    res.cookies.set(SYNC_OAUTH_COOKIE, `${id}:${state}:${verifier}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
      secure: process.env.NODE_ENV === "production" && process.env.FOURTY_INSECURE_COOKIE !== "1",
    });
    return res;
  });
}
