import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import {
  sign,
  signatureHeaders,
  verifyWebhookSignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhook-sign";

/**
 * Webhook HMAC signatures (Gate D3): the sign/verify primitives, and an end-to-end
 * proof that a workflow's webhook action delivers a request carrying a valid
 * `X-Fourty-Signature` a receiver can verify (and that tampering/replay fail).
 */
describe("webhook signature primitives", () => {
  const SECRET = "whsec_test";
  const BODY = JSON.stringify({ hello: "world" });

  it("verifies a well-formed signature", () => {
    const h = signatureHeaders(SECRET, BODY, 1_000_000);
    expect(verifyWebhookSignature(SECRET, h[SIGNATURE_HEADER], h[TIMESTAMP_HEADER], BODY, 5 * 60_000, 1_000_000)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, and replayed timestamp", () => {
    const ts = 1_000_000;
    const goodSig = `sha256=${sign(SECRET, ts, BODY)}`;
    expect(verifyWebhookSignature(SECRET, goodSig, String(ts), BODY + "x", 5 * 60_000, ts)).toBe(false);
    expect(verifyWebhookSignature("other", goodSig, String(ts), BODY, 5 * 60_000, ts)).toBe(false);
    // Timestamp outside tolerance (10 min later) → replay rejected.
    expect(verifyWebhookSignature(SECRET, goodSig, String(ts), BODY, 5 * 60_000, ts + 10 * 60_000)).toBe(false);
    expect(verifyWebhookSignature(SECRET, null, String(ts), BODY)).toBe(false);
  });
});

describe("signed webhook delivery (real engine + inline queue)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let dispatchEvent: typeof import("@/lib/workflows/engine").dispatchEvent;
  let getOrCreateSigningSecret: typeof import("@/lib/webhook-sign").getOrCreateSigningSecret;
  let ws: string;
  const realFetch = global.fetch;
  let captured: { url: string; headers: Record<string, string>; body: string } | null = null;

  beforeAll(async () => {
    await resetDb();
    process.env.FOURTY_ALLOW_PRIVATE_WEBHOOKS = "1"; // skip DNS in the SSRF guard
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    ({ dispatchEvent } = await import("@/lib/workflows/engine"));
    ({ getOrCreateSigningSecret } = await import("@/lib/webhook-sign"));
    ws = await createWorkspace();

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = {
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: String(init?.body ?? ""),
      };
      return new Response(null, { status: 200 });
    }) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
    delete process.env.FOURTY_ALLOW_PRIVATE_WEBHOOKS;
  });

  it("delivers a webhook whose signature verifies under the workspace secret", async () => {
    await withWorkspace(ws, async () => {
      await db.insert(tables.workflows).values({
        id: newId(),
        name: "notify",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "webhook", url: "https://hooks.example.test/endpoint" }]),
        createdAt: Date.now(),
      });

      await dispatchEvent({
        event: "contact.created",
        entityType: "contact",
        entityId: newId(),
        snapshot: { firstName: "Ada" },
      });

      expect(captured).not.toBeNull();
      expect(captured!.url).toBe("https://hooks.example.test/endpoint");
      const secret = await getOrCreateSigningSecret();
      const ok = verifyWebhookSignature(
        secret,
        captured!.headers[SIGNATURE_HEADER],
        captured!.headers[TIMESTAMP_HEADER],
        captured!.body,
      );
      expect(ok).toBe(true);
      // A wrong secret must fail.
      expect(
        verifyWebhookSignature("whsec_wrong", captured!.headers[SIGNATURE_HEADER], captured!.headers[TIMESTAMP_HEADER], captured!.body),
      ).toBe(false);
    });
  });
});

describe("webhook secret REST (GET/POST /api/webhooks/secret)", () => {
  const ADMIN = "frty_whsec_admin";
  const MEMBER = "frty_whsec_member";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let secretRoutes: typeof import("@/app/api/webhooks/secret/route");

  const req = (token: string, method = "GET") =>
    new Request("http://localhost/api/webhooks/secret", {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    secretRoutes = await import("@/app/api/webhooks/secret/route");
    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values([
      {
        id: newId(),
        workspaceId: ws,
        name: "admin",
        prefix: ADMIN.slice(0, 8),
        keyHash: sha256(ADMIN),
        role: "admin",
        createdAt: Date.now(),
      },
      {
        id: newId(),
        workspaceId: ws,
        name: "member",
        prefix: MEMBER.slice(0, 8),
        keyHash: sha256(MEMBER),
        role: "member",
        createdAt: Date.now(),
      },
    ]);
  });

  it("creates a secret on first GET and returns it again unchanged", async () => {
    const first = await secretRoutes.GET(req(ADMIN));
    expect(first.status).toBe(200);
    const a = await first.json();
    expect(a.secret).toMatch(/^whsec_/);
    expect(a.signatureHeader).toBe(SIGNATURE_HEADER);
    expect(a.timestampHeader).toBe(TIMESTAMP_HEADER);

    const second = await secretRoutes.GET(req(ADMIN));
    expect((await second.json()).secret).toBe(a.secret);
  });

  it("refuses a member key", async () => {
    expect((await secretRoutes.GET(req(MEMBER))).status).toBe(403);
    expect((await secretRoutes.POST(req(MEMBER, "POST"))).status).toBe(403);
  });

  it("rotates the secret on POST", async () => {
    const before = (await (await secretRoutes.GET(req(ADMIN))).json()).secret as string;
    const rotated = await secretRoutes.POST(req(ADMIN, "POST"));
    expect(rotated.status).toBe(200);
    const after = (await rotated.json()).secret as string;
    expect(after).toMatch(/^whsec_/);
    expect(after).not.toBe(before);
  });
});
