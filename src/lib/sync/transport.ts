import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { clientFromEnv, refreshAccessToken, type MailProvider } from "./oauth";
import { fetchRawMessages } from "./fetch-mail";
import { syncFetcher, type HttpFetcher } from "./http";
import { ingestEmails, type IngestResult } from "./ingest";

/**
 * Mail-sync transport orchestration (Gate C6 completion, ADR-009): keep a valid
 * OAuth access token (refresh + persist when expired), then pull recent mail and
 * hand the raw messages to the ingestion engine. Must run inside a withWorkspace()
 * transaction — it reads and writes the RLS-scoped sync_accounts row.
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
 * Return a usable access token for the account, refreshing and persisting it when
 * the cached one is missing or within the skew window of expiry.
 */
export async function getValidAccessToken(account: SyncAccount, fetchImpl: HttpFetcher): Promise<string> {
  const provider = account.provider as MailProvider;
  const client = clientFromEnv(provider);
  if (!client) {
    throw new Error(`OAuth client for '${provider}' is not configured (set the provider env vars)`);
  }
  const cfg = JSON.parse(account.config) as OAuthTokenConfig & Record<string, unknown>;
  if (cfg.accessToken && cfg.expiresAt && cfg.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return cfg.accessToken;
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
  await db
    .update(tables.syncAccounts)
    .set({ config: JSON.stringify(next) })
    .where(eq(tables.syncAccounts.id, account.id));
  return refreshed.access_token;
}

/** Pull recent mail via OAuth and run it through the ingestion engine. */
export async function runMailSync(account: SyncAccount, opts: { limit?: number } = {}): Promise<IngestResult> {
  const fetchImpl = syncFetcher();
  const token = await getValidAccessToken(account, fetchImpl);
  const raws = await fetchRawMessages(account.provider as MailProvider, token, { limit: opts.limit }, fetchImpl);
  return ingestEmails(account.id, raws);
}
