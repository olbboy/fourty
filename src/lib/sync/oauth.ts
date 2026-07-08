import { createHash, randomBytes } from "node:crypto";
import type { HttpFetcher } from "./http";

/**
 * OAuth 2.0 Authorization Code + PKCE for mailbox providers (Gate C6 completion,
 * ADR-009). Google (Gmail) and Microsoft (Graph) read-only mail scopes, offline
 * access so a refresh token is issued. The app registers ONE OAuth client per
 * provider (env), so client credentials live in env, not per-account config —
 * only the resulting tokens are stored on the sync account.
 */

export type MailProvider = "google" | "microsoft";

/** httpOnly cookie carrying `${accountId}:${state}:${verifier}` across the connect
 * redirect for CSRF + PKCE (set by the connect route, verified by the callback). */
export const SYNC_OAUTH_COOKIE = "fourty_sync_oauth";

type ProviderConfig = { authEndpoint: string; tokenEndpoint: string; scopes: string };

export const PROVIDERS: Record<MailProvider, ProviderConfig> = {
  google: {
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/gmail.readonly",
  },
  microsoft: {
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: "offline_access Mail.Read",
  },
};

export type OAuthClient = { clientId: string; clientSecret: string };

/** The instance's OAuth app credentials for a provider, or null if unconfigured. */
export function clientFromEnv(provider: MailProvider): OAuthClient | null {
  const prefix = provider === "google" ? "GOOGLE" : "MICROSOFT";
  const clientId = process.env[`${prefix}_OAUTH_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_OAUTH_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

/** PKCE (RFC 7636) S256: challenge = base64url(sha256(verifier)). */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return b64url(randomBytes(24));
}

/** The provider consent URL to redirect the browser to (offline + PKCE). */
export function buildConsentUrl(
  provider: MailProvider,
  client: OAuthClient,
  p: { redirectUri: string; state: string; codeChallenge: string; loginHint?: string | null },
): string {
  const url = new URL(PROVIDERS[provider].authEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("scope", PROVIDERS[provider].scopes);
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Force a refresh token: Google needs access_type=offline + prompt=consent;
  // Microsoft issues one whenever offline_access is in scope (harmless here).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (p.loginHint) url.searchParams.set("login_hint", p.loginHint);
  return url.toString();
}

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function postToken(
  provider: MailProvider,
  body: URLSearchParams,
  fetchImpl: HttpFetcher,
  label: string,
): Promise<TokenResponse> {
  const res = await fetchImpl(PROVIDERS[provider].tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (res.status !== 200) throw new Error(`${label} failed (HTTP ${res.status})`);
  return (await res.json()) as TokenResponse;
}

/** Exchange the authorization code for tokens. */
export function exchangeCode(
  provider: MailProvider,
  client: OAuthClient,
  p: { code: string; redirectUri: string; codeVerifier: string },
  fetchImpl: HttpFetcher,
): Promise<TokenResponse> {
  return postToken(
    provider,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code_verifier: p.codeVerifier,
    }),
    fetchImpl,
    "token exchange",
  );
}

/** Trade a refresh token for a fresh access token. */
export function refreshAccessToken(
  provider: MailProvider,
  client: OAuthClient,
  refreshToken: string,
  fetchImpl: HttpFetcher,
): Promise<TokenResponse> {
  return postToken(
    provider,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
    fetchImpl,
    "token refresh",
  );
}
