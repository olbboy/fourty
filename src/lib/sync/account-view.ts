import { tables } from "@/db";
import { peekAccountConfig, URL_HOST_FIELD } from "./account-config";

/**
 * Serialize a sync_accounts row for the API. The `config` blob holds provider
 * connection details (IMAP credentials, OAuth tokens, an ICS feed URL), so it is
 * never returned wholesale — only non-secret hints survive, plus a `connected`
 * flag telling the client whether a refresh token is on file.
 *
 * The ICS feed URL is a credential (ADR-019) and is never returned, not even to
 * an admin: it grants read access to the calendar, and there is nothing the
 * settings page does with it that its hostname does not do as well. The
 * hostname is stored unsealed for exactly this, so listing mailboxes needs no
 * encryption key — which matters most on the install whose key has gone
 * missing.
 */
export type SyncAccountRow = typeof tables.syncAccounts.$inferSelect;

export function redactAccount(row: SyncAccountRow) {
  const cfg = peekAccountConfig(row.config);
  const safe: Record<string, unknown> = {};
  if (typeof cfg.host === "string") safe.host = cfg.host;
  if (typeof cfg[URL_HOST_FIELD] === "string") safe.urlHost = cfg[URL_HOST_FIELD];
  const { config: _config, ...rest } = row;
  return { ...rest, config: safe, connected: typeof cfg.refreshToken === "string" };
}
