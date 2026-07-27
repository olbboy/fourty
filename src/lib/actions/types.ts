import type { z } from "zod";
import type { ActivityInput } from "@/lib/activity";
import type { EventContext } from "@/lib/workflows/types";

/**
 * Who is running an action. Structurally the same as `ToolContext` in
 * `src/mcp/tools.ts` — kept as its own name because the kernel is not
 * MCP-specific; the two converge once every surface goes through the registry.
 */
export type ActionContext = {
  workspaceId: string;
  role: string;
  userId: string | null;
  /** "mcp" | "ai" | undefined — marks agent-initiated writes in the audit log. */
  via?: string;
};

/** Failure kinds every surface knows how to express in its own idiom. */
export type ActionErrorKind = "forbidden" | "invalid" | "not_found";

export class ActionError extends Error {
  constructor(
    readonly kind: ActionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * An action whose effects need state from before the mutation returns it
 * alongside the caller-facing value. Only `payload` reaches the caller; the
 * rest is for the effects. Keeps effects pure functions of (input, output, ctx)
 * without adding a lifecycle hook.
 *
 * The kernel recognises the envelope by the presence of a `payload` key, so an
 * action must not return a bare row that itself has a `payload` column. No table
 * has one today; giving a table one means wrapping that row explicitly.
 */
export type PayloadEnvelope<P> = { payload: P } & Record<string, unknown>;

/**
 * The four side effects an action may declare. Deliberately a fixed set of
 * plain functions: no bus, no middleware, no plugins. Needing a fifth one is a
 * design signal, not a feature request (ADR-017).
 */
export type ActionEffects<I, O> = {
  /** Timeline entry, or null to write none (an update that changed nothing). */
  activity?: (input: I, out: O, ctx: ActionContext) => ActivityInput | null;
  /** Audit entry. `meta` matters: it carries `via` and the changed field names. */
  audit?: (
    input: I,
    out: O,
    ctx: ActionContext,
  ) => { key: string; objectType: string; objectId: string; meta?: Record<string, unknown> } | null;
  /** Recompute a derived score. Runs after audit, before events. */
  rescore?: (input: I, out: O) => Promise<void> | null;
  /** Workflow events to dispatch. An empty list dispatches nothing. */
  events?: (input: I, out: O) => EventContext[];
};

export type ActionDef<I, O> = {
  /** Registry key, e.g. "contacts.create". */
  name: string;
  /** RBAC + field-permission key, e.g. "contacts". Matches the route segment. */
  object: string;
  verb: "read" | "create" | "update" | "delete";
  description: string;
  input: z.ZodType<I>;
  /**
   * Which surfaces serve this action. Declarative only — adapters are still
   * wired by hand. It exists so coverage can be asserted ("declared for mcp,
   * therefore tools/list must list it").
   */
  expose: { rest?: boolean; graphql?: boolean; mcp?: boolean; ai?: boolean };
  run: (input: I, ctx: ActionContext) => Promise<O>;
  effects?: ActionEffects<I, O>;
};
