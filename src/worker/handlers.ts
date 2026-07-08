import { claimJob, type JobEnvelope, type JobName } from "@/lib/queue";
import { checkWebhookUrl } from "@/lib/net";
import { runWorkflowsForEvent } from "@/lib/workflows/engine";
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
    const { url, body, event } = env.data;
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
      headers: { "content-type": "application/json" },
      body,
    });
    // Non-2xx → throw so pg-boss retries with backoff (dead-letters when spent).
    if (!res.ok) throw new Error(`webhook ${url} responded ${res.status}`);
    log().info({ url, event, status: res.status }, "webhook delivered");
  },

  "workflow.dispatch": async (env) => {
    await runWorkflowsForEvent(env.data.ctx);
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
