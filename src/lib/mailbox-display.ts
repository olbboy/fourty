import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Engine lastError / API bodies that mean FOURTY_SECRET_KEY is missing or invalid. */
export function isSecretKeyError(error: unknown): boolean {
  return (
    typeof error === "string" &&
    (error.includes("cannot be encrypted") || error.includes("unencrypted") || error.includes("must decode to"))
  );
}

/**
 * Account `lastError` is a stable English machine record (tests + DB column).
 * Map known engine lines at display time; leave anything else as written.
 */
export function formatMailboxLastError(error: string, t: Translate): string {
  return t("settings.mailboxLastFailed", { error: mailboxErrorDetail(error, t) });
}

function mailboxErrorDetail(error: string, t: Translate): string {
  if (error === "sync failed") return t("settings.mailboxErrSync");
  if (error === "fetch failed") return t("settings.mailboxErrFetch");
  if (error === "account is not connected (no refresh token)") return t("settings.mailboxErrNotConnected");
  if (error === "refresh returned no access_token") return t("settings.mailboxErrNoAccessToken");

  const feed = /^feed responded (\d+)$/.exec(error);
  if (feed) return t("settings.mailboxErrFeedHttp", { status: feed[1] });

  const gmail = /^gmail list failed \(HTTP (\d+)\)$/.exec(error);
  if (gmail) return t("settings.mailboxErrGmailHttp", { status: gmail[1] });

  const graph = /^graph list failed \(HTTP (\d+)\)$/.exec(error);
  if (graph) return t("settings.mailboxErrGraphHttp", { status: graph[1] });

  const refresh = /^token refresh failed \(HTTP (\d+)\)$/.exec(error);
  if (refresh) return t("settings.mailboxErrTokenRefreshHttp", { status: refresh[1] });

  const http = /failed \(HTTP (\d+)\)$/.exec(error);
  if (http) return t("settings.mailboxErrHttp", { status: http[1] });

  const oauth = /^OAuth client for '([^']+)' is not configured/.exec(error);
  if (oauth) return t("settings.mailboxErrOauthNotConfigured", { provider: oauth[1] });

  if (isSecretKeyError(error)) return t("settings.mailboxErrNoSecretKey");
  if (/aborted|timeout/i.test(error)) return t("settings.mailboxErrTimeout");

  return error;
}
