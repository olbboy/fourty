import type { HttpFetcher } from "./http";
import type { MailProvider } from "./oauth";

/**
 * Provider mail fetch (Gate C6 completion, ADR-009). Pulls recent messages as raw
 * RFC822 strings — exactly what the existing `ingestEmails` engine consumes — so
 * no new parsing path is needed. Gmail returns the raw message base64url-encoded
 * (`format=raw`); Microsoft Graph returns MIME directly (`/$value`). All network
 * goes through the injectable `HttpFetcher`.
 */

/** Recent messages as raw RFC822 strings, ready for ingestEmails(). */
export function fetchRawMessages(
  provider: MailProvider,
  accessToken: string,
  opts: { limit?: number },
  fetchImpl: HttpFetcher,
): Promise<string[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  return provider === "google"
    ? fetchGmail(accessToken, limit, fetchImpl)
    : fetchGraph(accessToken, limit, fetchImpl);
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

async function fetchGmail(token: string, limit: number, fetchImpl: HttpFetcher): Promise<string[]> {
  const listRes = await fetchImpl(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`,
    { headers: bearer(token) },
  );
  if (listRes.status !== 200) throw new Error(`gmail list failed (HTTP ${listRes.status})`);
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const raws: string[] = [];
  for (const { id } of list.messages ?? []) {
    const res = await fetchImpl(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`,
      { headers: bearer(token) },
    );
    if (res.status !== 200) continue; // skip a message we can't read, keep going
    const msg = (await res.json()) as { raw?: string };
    if (msg.raw) raws.push(Buffer.from(msg.raw, "base64url").toString("utf8"));
  }
  return raws;
}

async function fetchGraph(token: string, limit: number, fetchImpl: HttpFetcher): Promise<string[]> {
  const listRes = await fetchImpl(
    `https://graph.microsoft.com/v1.0/me/messages?$top=${limit}&$select=id`,
    { headers: bearer(token) },
  );
  if (listRes.status !== 200) throw new Error(`graph list failed (HTTP ${listRes.status})`);
  const list = (await listRes.json()) as { value?: { id: string }[] };
  const raws: string[] = [];
  for (const { id } of list.value ?? []) {
    const res = await fetchImpl(`https://graph.microsoft.com/v1.0/me/messages/${id}/$value`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) continue;
    raws.push(await res.text()); // Graph $value is the raw MIME message
  }
  return raws;
}
