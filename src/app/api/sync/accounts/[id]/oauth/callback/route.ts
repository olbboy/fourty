import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize } from "@/lib/api";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { clientFromEnv, exchangeCode, SYNC_OAUTH_COOKIE, type MailProvider } from "@/lib/sync/oauth";
import { syncFetcher } from "@/lib/sync/http";
import type { OAuthTokenConfig } from "@/lib/sync/transport";

/**
 * OAuth redirect callback for a mailbox account (Gate C6 completion, ADR-009).
 * Authenticated (sync:update); verifies the CSRF state cookie, exchanges the code,
 * and stores the tokens on the account's config (never returned by the API). Then
 * redirects back to Settings.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toSettings(origin: string, status: string): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("sync", status);
  return NextResponse.redirect(url.toString(), 302);
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(/;\s*/)) {
    const eqAt = part.indexOf("=");
    if (eqAt !== -1 && part.slice(0, eqAt) === name) {
      // Cookie serialization percent-encodes the ':' separators — decode to recover them.
      try {
        return decodeURIComponent(part.slice(eqAt + 1));
      } catch {
        return part.slice(eqAt + 1);
      }
    }
  }
  return undefined;
}

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "update");
    if (denied) return denied;
    const { id } = await params;
    const url = new URL(req.url);
    const origin = url.origin;

    if (url.searchParams.get("error")) return toSettings(origin, "error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return toSettings(origin, "error");

    // CSRF: the cookie must bind this account + state; it carries the PKCE verifier.
    const [cid, cstate, verifier] = (readCookie(req, SYNC_OAUTH_COOKIE) ?? "").split(":");
    if (!verifier || cid !== id || cstate !== state) return toSettings(origin, "error");

    const account = (
      await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
    )[0];
    if (!account || (account.provider !== "google" && account.provider !== "microsoft")) {
      return toSettings(origin, "error");
    }
    const provider = account.provider as MailProvider;
    const client = clientFromEnv(provider);
    if (!client) return toSettings(origin, "error");

    try {
      const redirectUri = `${origin}/api/sync/accounts/${id}/oauth/callback`;
      const tokens = await exchangeCode(provider, client, { code, redirectUri, codeVerifier: verifier }, syncFetcher());
      if (!tokens.refresh_token && !tokens.access_token) throw new Error("token response had no tokens");

      const cfg = JSON.parse(account.config) as OAuthTokenConfig & Record<string, unknown>;
      const next: OAuthTokenConfig & Record<string, unknown> = {
        ...cfg,
        accessToken: tokens.access_token ?? cfg.accessToken,
        refreshToken: tokens.refresh_token ?? cfg.refreshToken,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : cfg.expiresAt,
      };
      await db
        .update(tables.syncAccounts)
        .set({ config: JSON.stringify(next), status: "active", lastError: null })
        .where(eq(tables.syncAccounts.id, id));
      await audit(auth.user?.id, "sync_account.connected", { objectType: "sync_account", objectId: id, meta: { provider } });

      const res = toSettings(origin, "connected");
      res.cookies.delete(SYNC_OAUTH_COOKIE);
      return res;
    } catch (err) {
      log().warn({ err: String(err), account: id }, "sync oauth callback failed");
      return toSettings(origin, "error");
    }
  });
}
