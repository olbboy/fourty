import { withAuth, authorize, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getOrCreateSigningSecret, rotateSigningSecret, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/lib/webhook-sign";

/**
 * Webhook signing secret (Gate D3). Admin-only. GET returns (creating on first
 * use) the workspace's secret so a receiver can verify signatures; POST rotates
 * it. Outbound webhooks are signed `sha256=HMAC(secret, "<timestamp>.<body>")`
 * with the timestamp in a header.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "webhooks", "read");
    if (denied) return denied;
    const secret = await getOrCreateSigningSecret();
    return json({ secret, signatureHeader: SIGNATURE_HEADER, timestampHeader: TIMESTAMP_HEADER });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "webhooks", "update");
    if (denied) return denied;
    const secret = await rotateSigningSecret();
    await audit(auth.user?.id, "webhook_secret.rotated", { objectType: "webhook_secret" });
    return json({ secret });
  });
}
