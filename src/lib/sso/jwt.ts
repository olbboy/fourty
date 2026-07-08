import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from "node:crypto";

/**
 * Minimal JWT + JWKS verification for OIDC ID tokens (Gate D4, ADR-014).
 *
 * Dependency-free on node:crypto — consistent with the hand-rolled TOTP (D2) and
 * webhook HMAC (D3). Supports RS256 (the OIDC default, and what every major IdP
 * signs ID tokens with); other algorithms are rejected rather than silently
 * trusted. Verified against a locally-generated RSA keypair in tests/sso.test.ts.
 */

// Base on node:crypto's JsonWebKey (not the DOM one) so it feeds createPublicKey
// directly. kid/alg/use are the JWK metadata OIDC providers attach.
export type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export type JwtClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  [claim: string]: unknown;
};

export type DecodedJwt = {
  header: { alg: string; kid?: string; typ?: string };
  claims: JwtClaims;
  signingInput: string; // the exact "header.payload" bytes that were signed
  signature: Buffer;
};

function b64urlToBuffer(part: string): Buffer {
  return Buffer.from(part, "base64url");
}

function b64urlToJson(part: string): unknown {
  return JSON.parse(b64urlToBuffer(part).toString("utf8"));
}

/** Decode a compact JWT WITHOUT verifying it. Throws on a malformed token. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed JWT: expected 3 segments");
  const [h, p, s] = parts;
  const header = b64urlToJson(h) as DecodedJwt["header"];
  const claims = b64urlToJson(p) as JwtClaims;
  if (!header || typeof header.alg !== "string") throw new Error("malformed JWT header");
  return { header, claims, signingInput: `${h}.${p}`, signature: b64urlToBuffer(s) };
}

/**
 * Verify the RS256 signature of a decoded token against a JWKS. Tries every RSA
 * key whose `kid` matches (or all RSA keys when the token/JWKS omit `kid`).
 */
export function verifySignature(decoded: DecodedJwt, jwks: { keys: Jwk[] }): boolean {
  if (decoded.header.alg !== "RS256") return false;
  const candidates = (jwks.keys ?? []).filter(
    (k) => k.kty === "RSA" && (!decoded.header.kid || !k.kid || k.kid === decoded.header.kid),
  );
  for (const jwk of candidates) {
    try {
      const key = createPublicKey({ key: jwk, format: "jwk" });
      // Default RSA padding is PKCS#1 v1.5 = RSASSA-PKCS1-v1_5 (RS256).
      if (cryptoVerify("sha256", Buffer.from(decoded.signingInput), key, decoded.signature)) {
        return true;
      }
    } catch {
      // Malformed JWK or wrong key — try the next candidate.
    }
  }
  return false;
}

export type ClaimExpectations = {
  issuer: string;
  audience: string; // our client_id
  nonce?: string;
  now?: number; // ms; injectable for deterministic tests
};

const CLOCK_SKEW_SECONDS = 60;

/** Validate the standard OIDC claims (iss, aud, exp, nonce). */
export function validateClaims(
  claims: JwtClaims,
  expect: ClaimExpectations,
): { ok: true } | { ok: false; reason: string } {
  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  if (claims.iss !== expect.issuer) return { ok: false, reason: "issuer mismatch" };
  const audOk = Array.isArray(claims.aud)
    ? claims.aud.includes(expect.audience)
    : claims.aud === expect.audience;
  if (!audOk) return { ok: false, reason: "audience mismatch" };
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    return { ok: false, reason: "token expired" };
  }
  if (expect.nonce !== undefined && claims.nonce !== expect.nonce) {
    return { ok: false, reason: "nonce mismatch" };
  }
  return { ok: true };
}

/** Decode + verify signature + validate claims in one step. */
export function verifyIdToken(
  token: string,
  jwks: { keys: Jwk[] },
  expect: ClaimExpectations,
): { ok: true; claims: JwtClaims } | { ok: false; reason: string } {
  let decoded: DecodedJwt;
  try {
    decoded = decodeJwt(token);
  } catch {
    return { ok: false, reason: "malformed token" };
  }
  if (!verifySignature(decoded, jwks)) return { ok: false, reason: "bad signature" };
  const validated = validateClaims(decoded.claims, expect);
  if (!validated.ok) return validated;
  return { ok: true, claims: decoded.claims };
}
