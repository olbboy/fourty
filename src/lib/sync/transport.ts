import type { tables } from "@/db";
import { clientFromEnv, refreshAccessToken, type MailProvider } from "./oauth";
import { fetchRawMessages } from "./fetch-mail";
import { syncFetcher, type HttpFetcher } from "./http";

/**
 * Mail-sync transport (Gate C6 completion, ADR-009): keep a valid OAuth access
 * token, then pull recent mail.
 *
 * **Nothing here touches the database, and nothing here runs inside a
 * transaction.** A token refresh and a mailbox fetch are provider round-trips;
 * holding a Postgres transaction open across one idles a connection for as long
 * as Google takes to answer, which is the mistake ADR-015 refused for LLM
 * streaming. So this module returns what needs persisting and lets `pull.ts`
 * write it in a short transaction of its own.
 */

type SyncAccount = typeof tables.syncAccounts.$inferSelect;

/** OAuth token material persisted in sync_accounts.config (never returned by the API). */
export type OAuthTokenConfig = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
};

const EXPIRY_SKEW_MS = 60_000;

/**
 * A usable access token, plus the account config to persist when the token had
 * to be refreshed. `config` is null when the cached token was still good.
 *
 * The caller persists it *before* fetching mail: a refresh that succeeds and is
 * then dropped because the fetch failed means refreshing again on every pull.
 */
export type TokenResult = { token: string; config: string | null };

/** Return a usable access token, refreshing it when the cached one has expired. */
export async function accessTokenFor(
  account: SyncAccount,
  fetchImpl: HttpFetcher = syncFetcher(),
): Promise<TokenResult> {
  const provider = account.provider as MailProvider;
  const client = clientFromEnv(provider);
  if (!client) {
    throw new Error(`OAuth client for '${provider}' is not configured (set the provider env vars)`);
  }
  const cfg = JSON.parse(account.config) as OAuthTokenConfig & Record<string, unknown>;
  if (cfg.accessToken && cfg.expiresAt && cfg.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return { token: cfg.accessToken, config: null };
  }
  if (!cfg.refreshToken) throw new Error("account is not connected (no refresh token)");

  const refreshed = await refreshAccessToken(provider, client, cfg.refreshToken, fetchImpl);
  if (!refreshed.access_token) throw new Error("refresh returned no access_token");
  const next: OAuthTokenConfig & Record<string, unknown> = {
    ...cfg,
    accessToken: refreshed.access_token,
    // Providers may omit a new refresh token on refresh — keep the existing one.
    refreshToken: refreshed.refresh_token ?? cfg.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  };
  return { token: refreshed.access_token, config: JSON.stringify(next) };
}

/** Fetch recent raw messages. No database, no transaction — just the provider. */
export async function fetchMail(
  account: SyncAccount,
  token: string,
  opts: { limit?: number } = {},
  fetchImpl: HttpFetcher = syncFetcher(),
): Promise<string[]> {
  return fetchRawMessages(account.provider as MailProvider, token, { limit: opts.limit }, fetchImpl);
}
