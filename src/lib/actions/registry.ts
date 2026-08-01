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

export type Surface = "rest" | "graphql" | "mcp" | "ai";

/** Actions a given surface is expected to serve. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function actionsFor(surface: Surface): ActionDef<any, any>[] {
  return allActions().filter((a) => a.expose[surface]);
}

/**
 * What each surface actually wired up, as opposed to what the actions claim.
 * Adapters record themselves here so the two can be compared: an action that
 * says it is served over MCP but was never turned into a tool is a gap nobody
 * would otherwise notice until an agent asked for it.
 */
const bound: Record<Surface, Set<string>> = { rest: new Set(), graphql: new Set(), mcp: new Set(), ai: new Set() };

export function recordBinding(surface: Surface, name: string): void {
  bound[surface].add(name);
}

export function boundActions(surface: Surface): string[] {
  return [...bound[surface]];
}
