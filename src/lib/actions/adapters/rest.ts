import { withAuth, json, apiError } from "@/lib/api";
import { execute } from "../execute";
import { recordBinding } from "../registry";
import { ActionError, type ActionDef } from "../types";

const STATUS: Record<ActionError["kind"], number> = {
  forbidden: 403,
  invalid: 400,
  not_found: 404,
};

type RouteParams = { params: Promise<Record<string, string>> };

/**
 * Serve an action as a Next route handler. The adapter only translates: it
 * gathers the input, calls the kernel, and shapes the response. No guard, no
 * side effect, no business rule lives here.
 *
 * `body` names the response envelope, because REST wraps results per route
 * (`{ contact }`, `{ contacts }`) and that shape is a published contract.
 */
export function toRouteHandler<I, O>(
  action: ActionDef<I, O>,
  opts: { status?: number; body?: (out: unknown) => unknown } = {},
) {
  recordBinding("rest", action.name);
  return (req: Request, route?: RouteParams): Promise<Response> =>
    withAuth(req, async (auth) => {
      let input: Record<string, unknown>;
      try {
        input = { ...(await readInput(req)), ...(route ? await route.params : {}) };
      } catch {
        return apiError("Invalid JSON body");
      }
      try {
        const out = await execute(action, input, {
          workspaceId: auth.workspaceId,
          role: auth.role,
          userId: auth.user?.id ?? null,
        });
        return json(opts.body ? opts.body(out) : out, { status: opts.status ?? 200 });
      } catch (err) {
        if (err instanceof ActionError) return apiError(err.message, STATUS[err.kind]);
        throw err;
      }
    });
}

/**
 * Query string for reads, JSON body for writes — matching the existing routes.
 * A DELETE takes neither: it is addressed entirely by its path, and reading the
 * query string would start rejecting stray parameters that were always ignored.
 */
async function readInput(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "DELETE") return {};
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams);
  return (await req.json()) as Record<string, unknown>;
}
