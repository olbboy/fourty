import { describe, expect, it } from "vitest";
import { requestOrigin } from "@/lib/api";

/**
 * The origin every emailed link and OAuth redirect is built from. The case
 * that matters is the proxy one: Next reconstructs req.url from its bind
 * address, so behind cloudflared the naive origin is https://localhost:3000 —
 * which is exactly the dead link a real invite mail shipped with.
 */
describe("requestOrigin", () => {
  const req = (url: string, headers: Record<string, string>) => new Request(url, { headers });

  it("prefers x-forwarded-host + x-forwarded-proto behind a proxy", () => {
    expect(
      requestOrigin(
        req("https://localhost:3000/api/members/invite", {
          "x-forwarded-host": "crm.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://crm.example.com");
  });

  it("falls back to the Host header when the proxy sets no x-forwarded-host", () => {
    // cloudflared's default: original Host forwarded, proto in x-forwarded-proto.
    expect(
      requestOrigin(
        req("http://localhost:3000/api/members/invite", {
          host: "crm.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://crm.example.com");
  });

  it("reduces to the URL's own origin when nothing forwarded (direct exposure, tests)", () => {
    expect(requestOrigin(req("http://localhost:3100/api/x", {}))).toBe("http://localhost:3100");
  });

  it("takes the first proto from a multi-hop x-forwarded-proto list", () => {
    expect(
      requestOrigin(
        req("http://localhost:3000/x", {
          host: "crm.example.com",
          "x-forwarded-proto": "https, http",
        }),
      ),
    ).toBe("https://crm.example.com");
  });
});
