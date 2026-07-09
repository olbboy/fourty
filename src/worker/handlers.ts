import { claimJob, type JobEnvelope, type JobName } from "@/lib/queue";
import { checkWebhookUrl } from "@/lib/net";
import { runWorkflowsForEvent } from "@/lib/workflows/engine";
import { aiClientFromEnv } from "@/lib/ai";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";

/**
 * Job handlers (Gate B4). Each assumes it runs INSIDE a withWorkspace()
 * transaction — the worker wraps every job in one (RLS + audit apply); inline
 * mode calls them within the request's existing context. Handlers first claim
 * their idempotency key so at-least-once delivery yields exactly-once effects.
 */

type Handler<N extends JobName> = (env: JobEnvelope<N>) => Promise<void>;

const handlers: { [N in JobName]: Handler<N> } = {
  "webhook.deliver": async (env) => {
    const { url, body, event, headers } = env.data;
    // SSRF guard: resolve + reject private/loopback targets before leaving the
    // process (see net.ts). Kept here so retries re-check a (possibly re-pointed)
    // DNS name each attempt.
    const check = await checkWebhookUrl(url);
    if (!check.ok) {
      log().warn({ url, reason: check.reason }, "webhook blocked");
      return; // blocked target — not an error to retry
    }
    const res = await fetch(url, {
      method: "POST",
      // Signature + timestamp headers (Gate D3) travel with the job so retries
      // resend the same signed request.
      headers: { "content-type": "application/json", ...(headers ?? {}) },
      body,
    });
    // Non-2xx → throw so pg-boss retries with backoff (dead-letters when spent).
    if (!res.ok) throw new Error(`webhook ${url} responded ${res.status}`);
    log().info({ url, event, status: res.status }, "webhook delivered");
  },

  "workflow.dispatch": async (env) => {
    await runWorkflowsForEvent(env.data.ctx);
  },

  // Optional generative draft (ADR-015, Tier 3). Runs a BYO-key provider call
  // and writes the result as a DRAFT note on the entity — human-in-the-loop, the
  // AI never mutates a real field. No-ops when AI is disabled/unconfigured.
  "ai.generate": async (env) => {
    const { entityType, entityId, prompt, system } = env.data;
    const client = aiClientFromEnv();
    if (!client) {
      log().info({ entityType, entityId }, "ai.generate skipped — AI disabled");
      return;
    }
    const text = await client.generate({ system, prompt });
    if (!text) return;
    const id = newId();
    await db.insert(tables.notes).values({
      id,
      body: `🤖 AI draft (review before use):\n\n${text}`,
      entityType,
      entityId,
      authorId: null,
      createdAt: Date.now(),
    });
    await logActivity({ type: "note_added", entityType, entityId, meta: { detail: "AI draft" } });
    // Tag AI-initiated writes so they're auditable and distinguishable from human edits.
    await audit(null, "note.created", { objectType: "note", objectId: id, meta: { via: "ai", provider: client.provider } });
    log().info({ entityType, entityId, provider: client.provider }, "ai.generate wrote a draft note");
  },
};

/**
 * Run a job by name, claiming idempotency first. Returns silently if the key was
 * already processed (a redelivery). Throws to signal a retryable failure.
 */
export async function runJob<N extends JobName>(name: N, env: JobEnvelope<N>): Promise<void> {
  const fresh = await claimJob(env.idempotencyKey, name);
  if (!fresh) {
    log().info({ job: name, key: env.idempotencyKey }, "job already processed — skipping");
    return;
  }
  await handlers[name](env);
}
