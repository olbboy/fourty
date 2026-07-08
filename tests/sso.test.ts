import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  generateKeyPairSync,
  createHash,
  sign as cryptoSign,
  type KeyObject,
} from "node:crypto";
import { resetDb, createWorkspace } from "./pg-setup";
import { verifyIdToken, type Jwk } from "@/lib/sso/jwt";
import {
  generatePkce,
  buildAuthorizationUrl,
  discover,
  exchangeCode,
  type ProviderMetadata,
} from "@/lib/sso/oidc";
import type { HttpFetcher } from "@/lib/sso/http";

/**
 * SSO / OIDC (Gate D4, ADR-014). Three layers:
 *   1. JWT/JWKS RS256 verification against a locally-generated RSA keypair.
 *   2. The pure OIDC protocol core (PKCE, authorize URL, discovery, token grant)
 *      exercised against a fake IdP through the injectable HttpFetcher edge.
 *   3. The full start → callback → provision → session flow through the real
 *      route handlers on Postgres, with the IdP faked at the transport boundary.
 * next/headers cookies() is mocked with an in-memory jar so createSession works.
 */

// ── Test crypto helpers ──────────────────────────────────────────────────────
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function makeKeypair(kid: string): { privateKey: KeyObject; jwk: Jwk } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as Jwk), kid, alg: "RS256", use: "sig" };
  return { privateKey, jwk };
}

function signJwt(claims: Record<string, unknown>, privateKey: KeyObject, kid: string): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

// In-memory cookie jar so session routes work without a Next request scope.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => {
      jar.set(k, v);
    },
    delete: (k: string) => {
      jar.delete(k);
    },
  }),
}));

// ── 1. JWT / JWKS (RS256) ────────────────────────────────────────────────────
describe("SSO ID-token verification (RS256 + JWKS)", () => {
  const kid = "test-key-1";
  const { privateKey, jwk } = makeKeypair(kid);
  const jwks = { keys: [jwk] };
  const now = 1_800_000_000_000; // fixed ms for determinism
  const nowSec = Math.floor(now / 1000);
  const claims = {
    iss: "https://idp.test",
    aud: "client-123",
    sub: "user-1",
    email: "a@b.io",
    email_verified: true,
    nonce: "n-1",
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const expect_ = { issuer: "https://idp.test", audience: "client-123", nonce: "n-1", now };

  it("verifies a well-formed RS256 token and returns its claims", () => {
    const r = verifyIdToken(signJwt(claims, privateKey, kid), jwks, expect_);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims.email).toBe("a@b.io");
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = signJwt(claims, privateKey, kid);
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url(JSON.stringify({ ...claims, email: "evil@b.io" }))}.${s}`;
    expect(verifyIdToken(forged, jwks, expect_).ok).toBe(false);
  });

  it("rejects a token signed by a different key", () => {
    const other = makeKeypair("other");
    // Signed by the attacker's key but presented under our kid → no match.
    const token = signJwt(claims, other.privateKey, kid);
    expect(verifyIdToken(token, jwks, expect_).ok).toBe(false);
  });

  it("enforces issuer, audience, nonce and expiry", () => {
    const token = signJwt(claims, privateKey, kid);
    expect(verifyIdToken(token, jwks, { ...expect_, issuer: "https://evil" }).ok).toBe(false);
    expect(verifyIdToken(token, jwks, { ...expect_, audience: "wrong" }).ok).toBe(false);
    expect(verifyIdToken(token, jwks, { ...expect_, nonce: "bad" }).ok).toBe(false);
    const expired = signJwt({ ...claims, exp: nowSec - 3600 }, privateKey, kid);
    expect(verifyIdToken(expired, jwks, expect_).ok).toBe(false);
  });
});

// ── 2. OIDC protocol core (pure, injectable HTTP edge) ───────────────────────
describe("OIDC protocol core", () => {
  const metadata: ProviderMetadata = {
    issuer: "https://idp.test",
    authorization_endpoint: "https://idp.test/authorize",
    token_endpoint: "https://idp.test/token",
    jwks_uri: "https://idp.test/jwks",
  };

  it("derives the PKCE challenge as base64url(sha256(verifier))", () => {
    const { verifier, challenge } = generatePkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("builds an authorize URL with response_type=code + PKCE S256 + nonce", () => {
    const url = new URL(
      buildAuthorizationUrl({
        metadata,
        clientId: "c",
        redirectUri: "https://app/cb",
        scope: "openid email",
        state: "st",
        nonce: "no",
        codeChallenge: "ch",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://idp.test/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("c");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app/cb");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("nonce")).toBe("no");
  });

  it("discovers metadata and rejects an issuer mismatch", async () => {
    const good: HttpFetcher = async () => ({ status: 200, json: async () => metadata });
    expect((await discover("https://idp.test", good)).token_endpoint).toBe("https://idp.test/token");
    const spoofed: HttpFetcher = async () => ({
      status: 200,
      json: async () => ({ ...metadata, issuer: "https://evil.test" }),
    });
    await expect(discover("https://idp.test", spoofed)).rejects.toThrow(/issuer/);
  });

  it("exchanges the code with the authorization_code grant + PKCE verifier", async () => {
    let capturedBody: string | undefined;
    const fetcher: HttpFetcher = async (_url, init) => {
      capturedBody = init?.body;
      return { status: 200, json: async () => ({ id_token: "tok", access_token: "at" }) };
    };
    const tokens = await exchangeCode(
      { metadata, clientId: "c", clientSecret: "s", code: "abc", redirectUri: "https://app/cb", codeVerifier: "ver" },
      fetcher,
    );
    expect(tokens.id_token).toBe("tok");
    const sent = new URLSearchParams(capturedBody);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("abc");
    expect(sent.get("code_verifier")).toBe("ver");
    expect(sent.get("client_secret")).toBe("s");
  });
});

// ── 3. Full login flow (real routes + Postgres + fake IdP) ───────────────────
describe("SSO login flow (real handlers + Postgres)", () => {
  const kid = "sso-key";
  const { privateKey, jwk } = makeKeypair(kid);
  const ISSUER = "https://idp.test";
  const CLIENT_ID = "fourty-client";
  const metadata: ProviderMetadata = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
  };
  let idToken: string | null = null;

  // Fake IdP: answers discovery, JWKS, and the token endpoint from memory.
  const fakeIdp: HttpFetcher = async (url) => {
    if (url.endsWith("/.well-known/openid-configuration")) {
      return { status: 200, json: async () => metadata };
    }
    if (url === metadata.jwks_uri) return { status: 200, json: async () => ({ keys: [jwk] }) };
    if (url === metadata.token_endpoint) {
      return { status: 200, json: async () => ({ id_token: idToken, access_token: "at", token_type: "Bearer" }) };
    }
    return { status: 404, json: async () => ({}) };
  };

  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let eq: typeof import("drizzle-orm").eq;
  let newId: typeof import("@/lib/id").newId;
  let setSsoFetcher: typeof import("@/lib/sso/http").__setSsoFetcher;
  let start: typeof import("@/app/api/auth/sso/[id]/start/route");
  let callback: typeof import("@/app/api/auth/sso/[id]/callback/route");
  let wsId: string;
  let connId: string;

  const startReq = () => new Request(`http://localhost/api/auth/sso/${connId}/start`);
  const cbReq = (state: string) =>
    new Request(`http://localhost/api/auth/sso/${connId}/callback?code=abc&state=${state}`);
  const connParams = () => ({ params: Promise.resolve({ id: connId }) });

  async function beginLogin(): Promise<{ state: string; nonce: string }> {
    const res = await start.GET(startReq(), connParams());
    expect(res.status).toBe(302);
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    const row = (await db.select().from(tables.ssoLoginStates).where(eq(tables.ssoLoginStates.id, state)))[0];
    return { state, nonce: row.nonce };
  }

  function mintIdToken(nonce: string, over: Record<string, unknown> = {}): void {
    const nowSec = Math.floor(Date.now() / 1000);
    idToken = signJwt(
      {
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "idp|1",
        email: "sso.user@acme.io",
        email_verified: true,
        name: "SSO User",
        nonce,
        iat: nowSec,
        exp: nowSec + 3600,
        ...over,
      },
      privateKey,
      kid,
    );
  }

  beforeAll(async () => {
    await resetDb();
    jar.clear();
    ({ db, tables } = await import("@/db"));
    ({ eq } = await import("drizzle-orm"));
    ({ newId } = await import("@/lib/id"));
    ({ __setSsoFetcher: setSsoFetcher } = await import("@/lib/sso/http"));
    start = await import("@/app/api/auth/sso/[id]/start/route");
    callback = await import("@/app/api/auth/sso/[id]/callback/route");
    setSsoFetcher(fakeIdp);

    wsId = await createWorkspace();
    connId = newId();
    await db.insert(tables.ssoConnections).values({
      id: connId,
      label: "Acme SSO",
      issuer: ISSUER,
      clientId: CLIENT_ID,
      clientSecret: "shh",
      scopes: "openid email profile",
      enabled: 1,
      defaultWorkspaceId: wsId,
      defaultRole: "member",
      createdAt: Date.now(),
    });
  });

  afterAll(() => {
    setSsoFetcher(null);
  });

  it("start redirects to the IdP and persists PKCE state", async () => {
    const res = await start.GET(startReq(), connParams());
    expect(res.status).toBe(302);
    const authUrl = new URL(res.headers.get("location")!);
    expect(authUrl.origin + authUrl.pathname).toBe(`${ISSUER}/authorize`);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authUrl.searchParams.get("state")!;
    const row = (await db.select().from(tables.ssoLoginStates).where(eq(tables.ssoLoginStates.id, state)))[0];
    expect(row.codeVerifier).toBeTruthy();
    expect(row.redirectUri).toBe(`http://localhost/api/auth/sso/${connId}/callback`);
  });

  it("callback JIT-provisions a user, joins the default workspace, opens a session", async () => {
    jar.clear();
    const { state, nonce } = await beginLogin();
    mintIdToken(nonce);
    const res = await callback.GET(cbReq(state), connParams());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/dashboard");

    const user = (await db.select().from(tables.users).where(eq(tables.users.email, "sso.user@acme.io")))[0];
    expect(user).toBeTruthy();
    expect(user.name).toBe("SSO User");
    const members = await db
      .select()
      .from(tables.workspaceMembers)
      .where(eq(tables.workspaceMembers.userId, user.id));
    expect(members).toHaveLength(1);
    expect(members[0].workspaceId).toBe(wsId);
    const sessions = await db.select().from(tables.sessions).where(eq(tables.sessions.userId, user.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].workspaceId).toBe(wsId);
    expect(jar.has("fourty_session")).toBe(true);
  });

  it("makes the login state single-use (replay is rejected)", async () => {
    const { state, nonce } = await beginLogin();
    mintIdToken(nonce);
    const first = await callback.GET(cbReq(state), connParams());
    expect(first.headers.get("location")).toContain("/dashboard");
    const replay = await callback.GET(cbReq(state), connParams());
    expect(replay.headers.get("location")).toContain("sso_error=invalid_or_expired_state");
  });

  it("rejects an expired state", async () => {
    const { state } = await beginLogin();
    await db
      .update(tables.ssoLoginStates)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(tables.ssoLoginStates.id, state));
    mintIdToken("ignored");
    const res = await callback.GET(cbReq(state), connParams());
    expect(res.headers.get("location")).toContain("sso_error=invalid_or_expired_state");
  });

  it("rejects a nonce mismatch and creates no session", async () => {
    const { state } = await beginLogin();
    mintIdToken("attacker-nonce");
    const res = await callback.GET(cbReq(state), connParams());
    expect(res.headers.get("location")).toContain("sso_error=sso_login_failed");
  });

  it("refuses an unverified email (no user provisioned)", async () => {
    const { state, nonce } = await beginLogin();
    mintIdToken(nonce, { email: "unverified@acme.io", email_verified: false });
    const res = await callback.GET(cbReq(state), connParams());
    expect(res.headers.get("location")).toContain("sso_error=sso_login_failed");
    const rows = await db.select().from(tables.users).where(eq(tables.users.email, "unverified@acme.io"));
    expect(rows).toHaveLength(0);
  });

  it("links an existing email instead of creating a duplicate user", async () => {
    const { createUser } = await import("@/lib/auth");
    const existingId = await createUser("existing@acme.io", "Existing", "password123");
    const { state, nonce } = await beginLogin();
    mintIdToken(nonce, { email: "existing@acme.io" });
    const res = await callback.GET(cbReq(state), connParams());
    expect(res.headers.get("location")).toContain("/dashboard");
    const rows = await db.select().from(tables.users).where(eq(tables.users.email, "existing@acme.io"));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existingId);
  });
});
