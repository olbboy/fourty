import { tables } from "@/db";

/**
 * Serialize a sync_accounts row for the API. The `config` blob holds provider
 * connection details (IMAP credentials, OAuth tokens, an ICS feed URL), so it is
 * never returned wholesale — only non-secret hints survive, plus a `connected`
 * flag telling the client whether a refresh token is on file.
 */
export type SyncAccountRow = typeof tables.syncAccounts.$inferSelect;

export function redactAccount(row: SyncAccountRow) {
  const cfg = JSON.parse(row.config) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  // Only surface non-secret hints (e.g. the ICS URL host, IMAP host) — never creds
  // or OAuth tokens. `connected` tells the UI a refresh token is present.
  if (typeof cfg.host === "string") safe.host = cfg.host;
  if (typeof cfg.url === "string") safe.url = cfg.url;
  const { config: _config, ...rest } = row;
  return { ...rest, config: safe, connected: typeof cfg.refreshToken === "string" };
}
