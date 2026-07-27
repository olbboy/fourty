import type { ActionDef } from "./types";

/**
 * Declare an action. The function is the identity — it exists so TypeScript can
 * infer `I` from the zod schema and `O` from `run`, which makes `effects`
 * type-check against the real output shape instead of `unknown`.
 */
export function defineAction<I, O>(def: ActionDef<I, O>): ActionDef<I, O> {
  return def;
}
