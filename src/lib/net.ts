import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF protection for outbound webhook URLs.
 *
 * Workflow webhook actions POST to a user-supplied URL. Without a guard, anyone
 * who can create a workflow (today: any authenticated user) could point it at
 * internal infrastructure — the cloud metadata endpoint (169.254.169.254),
 * localhost admin ports, or private-network services — and exfiltrate the
 * response or trigger internal side effects. We block private, loopback,
 * link-local and unique-local targets by default.
 *
 * Self-hosters who legitimately need to reach a service on their private LAN
 * (n8n on 192.168.x, a sidecar on localhost) can opt out with
 * `FOURTY_ALLOW_PRIVATE_WEBHOOKS=1`.
 *
 * Limitation: we resolve the hostname and check every returned address, which
 * defeats direct-IP and static-hostname attacks. It does not fully defeat
 * DNS-rebinding (a host that resolves public here but private at fetch time);
 * closing that requires pinning the resolved IP into the connection, which is
 * out of scope for a fire-and-forget webhook. This is a meaningful reduction in
 * attack surface, not an absolute guarantee — stated honestly.
 */

/** True if `ip` (v4 or v6 literal) is in a private / loopback / link-local range. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true; // not a parseable IP → treat as unsafe
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export type UrlCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validate an outbound webhook URL: must be http(s), and (unless private
 * webhooks are allowed) must resolve only to public addresses. Async because it
 * resolves DNS. Never throws — returns a structured result.
 */
export async function checkWebhookUrl(
  raw: string,
  allowPrivate = process.env.FOURTY_ALLOW_PRIVATE_WEBHOOKS === "1",
): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `unsupported protocol ${url.protocol}` };
  }
  if (allowPrivate) return { ok: true };

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost blocked" };
  }

  if (isIP(host)) {
    return isPrivateIp(host)
      ? { ok: false, reason: "private/loopback address blocked" }
      : { ok: true };
  }

  // Hostname → resolve and reject if ANY address is private.
  try {
    const results = await lookup(host, { all: true });
    if (results.length === 0) return { ok: false, reason: "host did not resolve" };
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        return { ok: false, reason: `resolves to private address ${address}` };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
}
