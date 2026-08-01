import { GraphQLError } from "graphql";
import { execute } from "../execute";
import { ActionError, type ActionDef } from "../types";

const CODE: Record<ActionError["kind"], string> = {
  forbidden: "FORBIDDEN",
  invalid: "BAD_USER_INPUT",
  not_found: "NOT_FOUND",
};

/**
 * The slice of the GraphQL context the adapter needs. Declared structurally so
 * the kernel side never imports the schema module, which imports the kernel.
 */
type ResolverContext = { auth: { workspaceId: string; role: string; user: { id: string } | null } };

/**
 * Serve an action as a GraphQL resolver. Resolver args become the action input
 * unchanged; `input`/`data` argument objects are flattened so a mutation taking
 * `(id, input)` reaches the kernel as one object.
 *
 * `onNotFound` exists because not-found is deliberately not uniform: the delete
 * mutations answer `false` rather than erroring, and unifying that would be a
 * breaking change to a published API.
 */
export function toResolver<I, O>(
  action: ActionDef<I, O>,
  opts: { onNotFound?: () => unknown; map?: (out: unknown) => unknown } = {},
) {
  return async (_root: unknown, args: Record<string, unknown>, ctx: ResolverContext): Promise<unknown> => {
    try {
      const out = await execute(action, flatten(args), {
        workspaceId: ctx.auth.workspaceId,
        role: ctx.auth.role,
        userId: ctx.auth.user?.id ?? null,
      });
      return opts.map ? opts.map(out) : out;
    } catch (err) {
      if (!(err instanceof ActionError)) throw err;
      if (err.kind === "not_found" && opts.onNotFound) return opts.onNotFound();
      throw new GraphQLError(err.message, { extensions: { code: CODE[err.kind] } });
    }
  };
}

function flatten(args: Record<string, unknown>): Record<string, unknown> {
  const { input, data, ...rest } = args;
  return { ...rest, ...asRecord(input), ...asRecord(data) };
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
