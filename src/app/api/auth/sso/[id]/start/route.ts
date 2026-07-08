import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { log } from "@/lib/logger";
import { ssoFetcher } from "@/lib/sso/http";
import {
  discover,
  generatePkce,
  randomState,
  randomNonce,
  buildAuthorizationUrl,
} from "@/lib/sso/oidc";

/**
 * Begin an OIDC login (Gate D4, ADR-014). Public — runs before any session
 * exists. Discovers the provider, mints a one-time state + PKCE verifier + nonce,
 * persists them, and 302-redirects the browser to the IdP's authorize endpoint.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATE_TTL_MS = 10 * 60 * 1000; // authorize round-trips complete in minutes

function toLogin(origin: string, error: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("sso_error", error);
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const origin = new URL(req.url).origin;

  const conn = (
    await db.select().from(tables.ssoConnections).where(eq(tables.ssoConnections.id, id)).limit(1)
  )[0];
  if (!conn || conn.enabled !== 1) return toLogin(origin, "unknown_or_disabled_provider");

  const redirectUri = `${origin}/api/auth/sso/${id}/callback`;
  try {
    const metadata = await discover(conn.issuer, ssoFetcher());
    const { verifier, challenge } = generatePkce();
    const state = randomState();
    const nonce = randomNonce();
    await db.insert(tables.ssoLoginStates).values({
      id: state,
      connectionId: id,
      codeVerifier: verifier,
      nonce,
      redirectUri,
      expiresAt: Date.now() + STATE_TTL_MS,
      createdAt: Date.now(),
    });
    const authUrl = buildAuthorizationUrl({
      metadata,
      clientId: conn.clientId,
      redirectUri,
      scope: conn.scopes,
      state,
      nonce,
      codeChallenge: challenge,
    });
    return NextResponse.redirect(authUrl, 302);
  } catch (err) {
    log().warn({ err: String(err), connection: id }, "sso start failed");
    return toLogin(origin, "provider_discovery_failed");
  }
}
