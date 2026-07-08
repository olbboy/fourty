import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { log } from "@/lib/logger";
import { createSession } from "@/lib/auth";
import { ssoFetcher } from "@/lib/sso/http";
import { discover, exchangeCode, fetchJwks } from "@/lib/sso/oidc";
import { verifyIdToken } from "@/lib/sso/jwt";
import { findOrProvisionUser, ensureMembershipForConnection } from "@/lib/sso/provision";

/**
 * OIDC redirect callback (Gate D4, ADR-014). Public — completes login and
 * establishes the session. Validates the one-time state, exchanges the code,
 * verifies the ID token's signature (JWKS/RS256) + claims (iss/aud/exp/nonce),
 * then JIT-provisions the user and issues a session cookie.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toLogin(origin: string, error: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("sso_error", error);
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const origin = url.origin;

  const idpError = url.searchParams.get("error");
  if (idpError) return toLogin(origin, `provider_error:${idpError}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return toLogin(origin, "missing_code_or_state");

  // Single-use state: read it, then delete immediately so a replayed callback
  // cannot reuse the same PKCE verifier/nonce.
  const stateRow = (
    await db.select().from(tables.ssoLoginStates).where(eq(tables.ssoLoginStates.id, state)).limit(1)
  )[0];
  if (stateRow) {
    await db.delete(tables.ssoLoginStates).where(eq(tables.ssoLoginStates.id, state));
  }
  if (!stateRow || stateRow.connectionId !== id || stateRow.expiresAt < Date.now()) {
    return toLogin(origin, "invalid_or_expired_state");
  }

  const conn = (
    await db.select().from(tables.ssoConnections).where(eq(tables.ssoConnections.id, id)).limit(1)
  )[0];
  if (!conn || conn.enabled !== 1) return toLogin(origin, "unknown_or_disabled_provider");

  try {
    const fetcher = ssoFetcher();
    const metadata = await discover(conn.issuer, fetcher);
    const tokens = await exchangeCode(
      {
        metadata,
        clientId: conn.clientId,
        clientSecret: conn.clientSecret,
        code,
        redirectUri: stateRow.redirectUri,
        codeVerifier: stateRow.codeVerifier,
      },
      fetcher,
    );
    if (!tokens.id_token) throw new Error("token response had no id_token");

    const jwks = await fetchJwks(metadata, fetcher);
    const verified = verifyIdToken(tokens.id_token, jwks, {
      issuer: metadata.issuer,
      audience: conn.clientId,
      nonce: stateRow.nonce,
    });
    if (!verified.ok) throw new Error(`id_token rejected: ${verified.reason}`);

    const { claims } = verified;
    const email = typeof claims.email === "string" ? claims.email : null;
    if (!email) throw new Error("id_token has no email claim");
    if (claims.email_verified === false) throw new Error("id_token email is unverified");

    const { userId } = await findOrProvisionUser(email, typeof claims.name === "string" ? claims.name : null);
    const workspaceId = await ensureMembershipForConnection(userId, conn);
    await createSession(userId, workspaceId);
    return NextResponse.redirect(new URL("/dashboard", origin).toString(), 302);
  } catch (err) {
    log().warn({ err: String(err), connection: id }, "sso callback failed");
    return toLogin(origin, "sso_login_failed");
  }
}
