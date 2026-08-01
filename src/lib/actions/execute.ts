import { can, type Action } from "@/lib/permissions";
import { loadFieldPolicy, redact, blockedWrites } from "@/lib/field-permissions";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { dispatchEvent } from "@/lib/workflows/engine";
import { ActionError, type ActionContext, type ActionDef } from "./types";

/**
 * Run an action's guard and side-effect chain. This is the single place those
 * steps exist, so REST, GraphQL, MCP and the AI agent cannot drift apart or
 * skip one.
 *
 * Order: RBAC → field-write permission → validate → run → activity → audit →
 * rescore → events → redact. Effects are invoked one at a time in that order.
 *
 * The relative position of audit and rescore is a deliberate normalisation: the
 * REST handlers disagree with themselves today (create audits before rescoring,
 * update after). They are independent — audit never reads a score — so the
 * kernel picks one order and a test pins it.
 *
 * Runs inside the caller's `withWorkspace()` transaction; it opens none of its
 * own. Note that `dispatchEvent` hands the job to the queue, which commits
 * outside that transaction — a pre-existing limitation the kernel inherits
 * rather than fixes (ADR-017).
 */
export async function execute<I, O>(
  action: ActionDef<I, O>,
  rawInput: unknown,
  ctx: ActionContext,
): Promise<unknown> {
  if (!can(ctx.role, action.object, action.verb as Action)) {
    throw new ActionError("forbidden", `Forbidden: ${ctx.role} cannot ${action.verb} ${action.object}`);
  }

  const policy = await loadFieldPolicy(ctx.role);
  // Only writes are checked against field-write permissions, matching REST and
  // MCP. A read's input holds filters, not values: `?status=lead` selects
  // contacts, it does not set anyone's status, and refusing it would deny a
  // filter to a role that is merely barred from editing that field.
  if (action.verb === "create" || action.verb === "update") {
    const inputKeys = rawInput && typeof rawInput === "object" ? Object.keys(rawInput) : [];
    const blocked = blockedWrites(policy, action.object, inputKeys);
    if (blocked.length) {
      throw new ActionError("forbidden", `Forbidden: cannot write ${action.object} field(s): ${blocked.join(", ")}`);
    }
  }

  const parsed = action.input.safeParse(rawInput);
  if (!parsed.success) {
    // "firstName: Required" — naming the field is what makes the message useful,
    // and it is the wording the REST and GraphQL handlers already return.
    const issue = parsed.error.issues[0];
    throw new ActionError("invalid", `${issue.path.join(".") || "input"}: ${issue.message}`);
  }
  const input = parsed.data;

  const out = await action.run(input, ctx);
  const effects = action.effects;

  const activity = effects?.activity?.(input, out, ctx);
  if (activity) await logActivity(activity);

  const entry = effects?.audit?.(input, out, ctx);
  if (entry) {
    await audit(ctx.userId, entry.key, { objectType: entry.objectType, objectId: entry.objectId, meta: entry.meta });
  }

  await effects?.rescore?.(input, out);

  for (const event of effects?.events?.(input, out) ?? []) {
    await dispatchEvent(event);
  }

  return redactOutput(policy, action.object, out);
}

/** Strip unreadable fields from whatever the caller is meant to receive. */
function redactOutput(policy: Awaited<ReturnType<typeof loadFieldPolicy>>, object: string, out: unknown): unknown {
  const value = isEnvelope(out) ? out.payload : out;
  if (Array.isArray(value)) {
    return value.map((row) => (isRecord(row) ? redact(policy, object, row) : row));
  }
  return isRecord(value) ? redact(policy, object, value) : value;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isEnvelope = (v: unknown): v is { payload: unknown } => isRecord(v) && "payload" in v;
