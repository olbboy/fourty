/**
 * The injectable network edge for OIDC (Gate D4, ADR-014).
 *
 * Every outbound call the OIDC flow makes — discovery, token exchange, JWKS —
 * goes through an `HttpFetcher`. Production uses `defaultFetcher` (a thin wrapper
 * over global fetch that refuses plaintext http except to loopback). Tests swap in
 * a fake IdP with `__setSsoFetcher`, so the whole flow — start → callback →
 * provision → session — is exercised end-to-end without a live identity provider.
 * This mirrors C6's "the transport is the injectable edge" design.
 */

export type HttpResponse = { status: number; json: () => Promise<unknown> };

export type HttpFetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponse>;

function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

// Default edge: global fetch, TLS-only so ID tokens / client secrets are never
// sent in the clear. Plaintext http is allowed only to loopback (a dev IdP), the
// same pragmatic carve-out the webhook SSRF guard makes for private networks.
const defaultFetcher: HttpFetcher = async (url, init) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
    throw new Error(`refusing non-https OIDC request (${parsed.protocol})`);
  }
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json() };
};

let current: HttpFetcher = defaultFetcher;

/** The active OIDC HTTP fetcher (default in prod; overridable in tests). */
export function ssoFetcher(): HttpFetcher {
  return current;
}

/** Test seam: override the OIDC HTTP edge with a fake IdP; pass null to restore. */
export function __setSsoFetcher(fetcher: HttpFetcher | null): void {
  current = fetcher ?? defaultFetcher;
}
