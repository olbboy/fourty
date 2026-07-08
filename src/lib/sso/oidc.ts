import { createHash, randomBytes } from "node:crypto";
import type { HttpFetcher } from "./http";
import type { Jwk } from "./jwt";

/**
 * OIDC Authorization Code flow with PKCE (Gate D4, ADR-014) — the pure protocol
 * core. Every network call takes an injectable `HttpFetcher`, so discovery, token
 * exchange, and JWKS retrieval are testable at the boundary without a live IdP.
 * Hand-rolled on node:crypto + WHATWG URL — no oidc-client / openid-client dep.
 */

export type ProviderMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

export type TokenSet = {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** PKCE (RFC 7636) S256: challenge = base64url(sha256(verifier)). */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return b64url(randomBytes(32));
}

export function randomNonce(): string {
  return b64url(randomBytes(16));
}

export function discoveryUrl(issuer: string): string {
  return `${trimSlash(issuer)}/.well-known/openid-configuration`;
}

const REQUIRED_ENDPOINTS = ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri"] as const;

/**
 * OIDC Discovery (§4): fetch `{issuer}/.well-known/openid-configuration`, require
 * the core endpoints, and reject an issuer that does not match the configured one
 * (defends against a substituted discovery document).
 */
export async function discover(issuer: string, fetchImpl: HttpFetcher): Promise<ProviderMetadata> {
  const res = await fetchImpl(discoveryUrl(issuer));
  if (res.status !== 200) throw new Error(`discovery failed (HTTP ${res.status})`);
  const meta = (await res.json()) as Partial<ProviderMetadata>;
  for (const field of REQUIRED_ENDPOINTS) {
    if (typeof meta[field] !== "string" || !meta[field]) {
      throw new Error(`discovery document missing ${field}`);
    }
  }
  if (trimSlash(meta.issuer as string) !== trimSlash(issuer)) {
    throw new Error("discovery issuer does not match configured issuer");
  }
  return meta as ProviderMetadata;
}

/** Build the authorize-endpoint redirect URL (response_type=code + PKCE S256). */
export function buildAuthorizationUrl(p: {
  metadata: ProviderMetadata;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(p.metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("scope", p.scope);
  url.searchParams.set("state", p.state);
  url.searchParams.set("nonce", p.nonce);
  url.searchParams.set("code_challenge", p.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Exchange the authorization code for tokens at the token endpoint. */
export async function exchangeCode(
  p: {
    metadata: ProviderMetadata;
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetchImpl: HttpFetcher,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    code_verifier: p.codeVerifier,
  });
  const res = await fetchImpl(p.metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (res.status !== 200) throw new Error(`token exchange failed (HTTP ${res.status})`);
  return (await res.json()) as TokenSet;
}

/** Fetch the provider's JSON Web Key Set (for ID-token signature verification). */
export async function fetchJwks(
  metadata: ProviderMetadata,
  fetchImpl: HttpFetcher,
): Promise<{ keys: Jwk[] }> {
  const res = await fetchImpl(metadata.jwks_uri);
  if (res.status !== 200) throw new Error(`jwks fetch failed (HTTP ${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys)) throw new Error("jwks document has no keys array");
  return { keys: body.keys };
}
