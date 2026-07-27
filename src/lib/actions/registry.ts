import type { ActionDef } from "./types";

/**
 * Every action, by name. Internal to this repo: actions are not loaded from
 * outside it and the shape is not a public contract (ADR-017).
 *
 * The registry exists so coverage is checkable — "declared for mcp, therefore
 * tools/list must list it" — not so anything can be resolved dynamically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const actions = new Map<string, ActionDef<any, any>>();

export function register<I, O>(action: ActionDef<I, O>): ActionDef<I, O> {
  if (actions.has(action.name)) {
    throw new Error(`Action "${action.name}" is already registered`);
  }
  actions.set(action.name, action);
  return action;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAction(name: string): ActionDef<any, any> | undefined {
  return actions.get(name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allActions(): ActionDef<any, any>[] {
  return [...actions.values()];
}

/** Actions a given surface is expected to serve. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function actionsFor(surface: "rest" | "graphql" | "mcp" | "ai"): ActionDef<any, any>[] {
  return allActions().filter((a) => a.expose[surface]);
}
