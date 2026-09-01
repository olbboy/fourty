import { eq } from "drizzle-orm";
import { currentStore, db, tables } from "@/db";
import { isAiEnabled } from "@/lib/ai/provider";
import { log } from "@/lib/logger";

/**
 * What this install can actually reach (Phase 0 of the agentic upgrade).
 *
 * The agent used to be told its role and nothing about the workspace it was
 * pointed at, so it planned around sources that were not connected and got a
 * thrown error where it should have got "that is not configured here". This
 * module is the one place that answers both questions — who we are, and what we
 * can reach — for the system prompt, for Settings → Diagnostics, and for any
 * tool that needs to decline politely.
 *
 * MAILBOX/CALENDAR/WEBHOOKS/CUSTOM_OBJECTS are per-workspace **rows**, not env
 * vars: a self-hoster's admin must not need a redeploy to change what the agent
 * can see. So there is no process-wide boolean here — `capabilities()` reads the
 * ambient workspace transaction (RLS scopes it) and the boot log carries module
 * registration only.
 *
 * Three small queries, one call site per request — cheap enough that a cache
 * would only add a staleness bug.
 */

export type CapabilityId = "AI_PROVIDER" | "MAILBOX" | "CALENDAR" | "WEBHOOKS" | "CUSTOM_OBJECTS";

export type CapabilityModule = {
  id: CapabilityId;
  label: string;
  /** Where an admin turns it on. Rendered in Diagnostics and in `unavailable()`. */
  configuredFrom: string;
  /** What it gives the agent, in one line. Goes into the system prompt. */
  gives: string;
};

export type CapabilityStatus = CapabilityModule & { on: boolean };

/** The registry. Adding a capability means adding a row here and a probe below. */
export const CAPABILITY_MODULES: readonly CapabilityModule[] = [
  {
    id: "AI_PROVIDER",
    label: "AI assistant",
    configuredFrom: "AI_API_KEY or GLM_API_KEY in the environment (bring your own key)",
    gives: "the chat and any model-backed pass",
  },
  {
    id: "MAILBOX",
    label: "Mailbox sync",
    configuredFrom: "Settings → Mailboxes",
    gives: "threads, replies and signature blocks — the best identity evidence there is",
  },
  {
    id: "CALENDAR",
    label: "Calendar",
    configuredFrom: "Settings → Mailboxes (an ICS feed)",
    gives: "meeting attendance",
  },
  {
    id: "WEBHOOKS",
    label: "Outbound webhooks",
    configuredFrom: "Settings → Webhooks (signing secret); Workflows → a workflow with a webhook action",
    gives: "notifying other systems when a record changes",
  },
  {
    id: "CUSTOM_OBJECTS",
    label: "Custom objects",
    configuredFrom: "Settings → Custom objects",
    gives: "extra record types the agent may read",
  },
] as const;

const MODULES_BY_ID = new Map(CAPABILITY_MODULES.map((m) => [m.id, m]));

/** The workspace's own description: name, plus what it sells if an admin said so. */
export type WorkspaceIdentity = { name: string; about: string | null };

export type Grounding = { workspace: WorkspaceIdentity; capabilities: CapabilityStatus[] };

/** Settings key holding the "what we sell" line. Capped — see WORKSPACE_ABOUT_MAX. */
export const WORKSPACE_ABOUT_KEY = "workspace.about";

/**
 * Hard cap on the identity block. Enforced at the write path (the API) and again
 * on render, because prompt bloat is a cost regression nobody notices in review.
 */
export const WORKSPACE_ABOUT_MAX = 320;

/** A read that fails must never take the agent down with it: log it, report off. */
async function probe<T>(id: CapabilityId, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log().warn({ capability: id, err: err instanceof Error ? err.message : String(err) }, "capability probe failed");
    return fallback;
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function requireWorkspace(): string {
  const workspaceId = currentStore().workspaceId;
  if (!workspaceId) {
    // Not a defensive nicety: outside withWorkspace() every read below is
    // unscoped, so a silent empty result would report every capability as off.
    throw new Error("capabilities(): call inside withWorkspace()");
  }
  return workspaceId;
}

/**
 * Per-workspace capability status. Must run inside `withWorkspace()` — it reads
 * the ambient transaction rather than opening its own, so it never nests a second
 * transaction inside an already-open request.
 */
export async function capabilities(): Promise<CapabilityStatus[]> {
  requireWorkspace();

  const accounts = await probeAccounts();
  const on: Record<CapabilityId, boolean> = {
    AI_PROVIDER: isAiEnabled(),
    MAILBOX: accounts.mailbox,
    CALENDAR: accounts.calendar,
    WEBHOOKS: await probe(
      "WEBHOOKS",
      async () => {
        const rows = await db
          .select({ actions: tables.workflows.actions })
          .from(tables.workflows)
          .where(eq(tables.workflows.enabled, 1));
        return rows.some((r) =>
          parseJson<{ type?: string }[]>(r.actions, []).some((a) => a.type === "webhook"),
        );
      },
      false,
    ),
    CUSTOM_OBJECTS: await probe(
      "CUSTOM_OBJECTS",
      async () => {
        const rows = await db.select({ id: tables.customObjects.id }).from(tables.customObjects).limit(1);
        return rows.length > 0;
      },
      false,
    ),
  };

  return CAPABILITY_MODULES.map((m) => ({ ...m, on: on[m.id] }));
}

/**
 * Mailbox and calendar both live in `sync_accounts`, so one read answers both.
 * A mailbox counts only when mail can actually arrive: OAuth providers need a
 * refresh token on file, IMAP is push-only and needs nothing. A calendar counts
 * only with a feed URL to fetch.
 */
async function probeAccounts(): Promise<{ mailbox: boolean; calendar: boolean }> {
  const rows = await probe(
    "MAILBOX",
    () =>
      db
        .select({
          provider: tables.syncAccounts.provider,
          status: tables.syncAccounts.status,
          config: tables.syncAccounts.config,
        })
        .from(tables.syncAccounts),
    [] as { provider: string; status: string; config: string }[],
  );

  const active = rows.filter((r) => r.status === "active");
  const mailbox = active.some((r) => {
    if (r.provider === "ics") return false;
    if (r.provider === "imap") return true;
    return typeof parseJson<Record<string, unknown>>(r.config, {}).refreshToken === "string";
  });
  const calendar = active.some(
    (r) => r.provider === "ics" && typeof parseJson<Record<string, unknown>>(r.config, {}).url === "string",
  );
  return { mailbox, calendar };
}

/** The workspace's identity block source. Same transaction rules as `capabilities()`. */
export async function workspaceIdentity(): Promise<WorkspaceIdentity> {
  const workspaceId = requireWorkspace();
  const [ws] = await db
    .select({ name: tables.workspaces.name })
    .from(tables.workspaces)
    .where(eq(tables.workspaces.id, workspaceId))
    .limit(1);
  const [about] = await db
    .select({ value: tables.settings.value })
    .from(tables.settings)
    .where(eq(tables.settings.key, WORKSPACE_ABOUT_KEY))
    .limit(1);
  return { name: ws?.name ?? "this workspace", about: about?.value?.trim() || null };
}

/** Everything the prompt needs about this install, in one round of reads. */
export async function grounding(): Promise<Grounding> {
  return { workspace: await workspaceIdentity(), capabilities: await capabilities() };
}

/**
 * The result a tool returns instead of throwing when its capability is off. It
 * is not an error: nothing the caller does differently will make it succeed, and
 * a retry loop against a missing integration is the exact failure this replaces.
 */
export function unavailable(id: CapabilityId): {
  ok: false;
  configured: false;
  capability: CapabilityId;
  reason: string;
} {
  const m = MODULES_BY_ID.get(id);
  const label = m?.label ?? id;
  const where = m ? ` It is configured from ${m.configuredFrom}.` : "";
  return {
    ok: false,
    configured: false,
    capability: id,
    reason: `${label} is not configured in this workspace, so there is nothing to read. Retrying will not help — say so and work with what the CRM already holds.${where}`,
  };
}

// ── Pure renderers (no DB — testable on their own) ───────────────────────────

/** The identity block. Capped so a long "about" can never crowd out the rules. */
export function workspaceMarkdown(identity: WorkspaceIdentity): string {
  const about = identity.about ? ` — ${identity.about}` : "";
  const line = `You are working inside ${identity.name}${about}.`;
  return line.length > WORKSPACE_ABOUT_MAX ? `${line.slice(0, WORKSPACE_ABOUT_MAX - 1)}…` : line;
}

/** The capability block: what is reachable, and what to say about what is not. */
export function capabilitiesMarkdown(list: CapabilityStatus[]): string {
  const on = list.filter((c) => c.on);
  const off = list.filter((c) => !c.on);
  const lines = ["What this install can reach:"];
  if (on.length === 0) {
    // Positively, not as an apology: a CRM with nothing connected is still a
    // complete source of truth for everything it holds.
    lines.push("- Nothing external is connected. Everything you can learn is already in the CRM.");
  } else {
    for (const c of on) lines.push(`- ${c.label}: ${c.gives}.`);
  }
  if (off.length > 0) {
    lines.push(
      `Not configured here: ${off.map((c) => c.label).join(", ")}. Never plan around these — if asked, say they are not set up and name where they would be (${off[0].configuredFrom}).`,
    );
  }
  return lines.join("\n");
}

/**
 * Boot log (once per process): which capability modules are registered. Status is
 * per workspace and deliberately absent here — a process-wide "mailbox: on" would
 * be a lie in any install with more than one workspace.
 */
export function logCapabilities(): void {
  log().info(
    { capabilities: CAPABILITY_MODULES.map((m) => m.id) },
    "capability modules registered (per-workspace status: Settings → Diagnostics)",
  );
}
