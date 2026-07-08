import { tables } from "@/db";

/**
 * Serialize an sso_connections row for the admin API. The client secret is never
 * returned — only whether one is set (like sync accounts redact their password).
 */
export type SsoConnectionRow = typeof tables.ssoConnections.$inferSelect;

export function redactConnection(row: SsoConnectionRow) {
  const { clientSecret: _clientSecret, ...rest } = row;
  return { ...rest, hasClientSecret: Boolean(row.clientSecret) };
}
