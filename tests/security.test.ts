import { describe, it, expect, beforeEach } from "vitest";
import { isPrivateIp, checkWebhookUrl } from "@/lib/net";
import { rateLimit, __resetRateLimits } from "@/lib/ratelimit";

describe("SSRF guard — isPrivateIp", () => {
  it("classifies private / loopback / link-local IPv4 as private", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "0.0.0.0",
      "100.64.0.1", // CGNAT
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("classifies public IPv4 as public", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("handles IPv6 loopback / link-local / unique-local", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true); // v4-mapped loopback
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false); // public
  });

  it("treats garbage as unsafe", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("999.999.999.999")).toBe(true);
  });
});

describe("SSRF guard — checkWebhookUrl", () => {
  it("blocks non-http protocols", async () => {
    expect((await checkWebhookUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await checkWebhookUrl("ftp://example.com")).ok).toBe(false);
    expect((await checkWebhookUrl("gopher://x")).ok).toBe(false);
  });

  it("blocks localhost and private IP literals by default", async () => {
    expect((await checkWebhookUrl("http://localhost:8080/x")).ok).toBe(false);
    expect((await checkWebhookUrl("http://127.0.0.1/x")).ok).toBe(false);
    expect((await checkWebhookUrl("http://169.254.169.254/latest/meta-data")).ok).toBe(false);
    expect((await checkWebhookUrl("http://[::1]/x")).ok).toBe(false);
    expect((await checkWebhookUrl("http://192.168.0.10/hook")).ok).toBe(false);
  });

  it("allows public IP literals", async () => {
    expect((await checkWebhookUrl("https://8.8.8.8/hook")).ok).toBe(true);
  });

  it("honors the FOURTY_ALLOW_PRIVATE_WEBHOOKS opt-out", async () => {
    expect((await checkWebhookUrl("http://127.0.0.1/x", true)).ok).toBe(true);
  });

  it("rejects malformed URLs", async () => {
    expect((await checkWebhookUrl("not a url")).ok).toBe(false);
  });
});

describe("rate limiter", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to the limit then blocks within the window", () => {
    const opts = { limit: 3, windowMs: 1000 };
    const t0 = 1_000_000;
    expect(rateLimit("k", opts, t0).allowed).toBe(true);
    expect(rateLimit("k", opts, t0).allowed).toBe(true);
    expect(rateLimit("k", opts, t0).allowed).toBe(true);
    const blocked = rateLimit("k", opts, t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const opts = { limit: 2, windowMs: 1000 };
    const t0 = 2_000_000;
    rateLimit("k2", opts, t0);
    rateLimit("k2", opts, t0);
    expect(rateLimit("k2", opts, t0).allowed).toBe(false);
    // advance past the window
    expect(rateLimit("k2", opts, t0 + 1001).allowed).toBe(true);
  });

  it("keys are independent", () => {
    const opts = { limit: 1, windowMs: 1000 };
    const t0 = 3_000_000;
    expect(rateLimit("a", opts, t0).allowed).toBe(true);
    expect(rateLimit("b", opts, t0).allowed).toBe(true);
    expect(rateLimit("a", opts, t0).allowed).toBe(false);
  });
});
