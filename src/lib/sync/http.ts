/**
 * Injectable network edge for the mail OAuth transport (Gate C6 completion,
 * ADR-009). OAuth token calls and provider mail-API fetches all go through an
 * `HttpFetcher`; production uses global fetch, tests swap in a fake provider so
 * the connect → refresh → fetch → ingest pipeline runs end-to-end without a live
 * mailbox. Same pattern as the SSO transport edge (ADR-014), kept local so sync
 * does not depend on the auth module.
 */

export type HttpResponse = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export type HttpFetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponse>;

const defaultFetcher: HttpFetcher = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json(), text: () => res.text() };
};

let current: HttpFetcher = defaultFetcher;

/** The active mail-transport fetcher (default in prod; overridable in tests). */
export function syncFetcher(): HttpFetcher {
  return current;
}

/** Test seam: override the mail transport with a fake provider; null restores. */
export function __setSyncFetcher(fetcher: HttpFetcher | null): void {
  current = fetcher ?? defaultFetcher;
}
