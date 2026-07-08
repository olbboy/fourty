import { graphql, type ExecutionResult } from "graphql";
import { withAuth, json, apiError } from "@/lib/api";
import { fourtySchema, type GqlContext } from "@/lib/graphql/schema";

/**
 * Auto-generated GraphQL endpoint (Gate C2, ADR-008). One POST accepts
 * { query, variables, operationName }; execution runs inside the request's
 * withWorkspace() transaction (RLS-scoped) with the authenticated caller in the
 * context. RBAC is enforced per-resolver via can() — the same predicate the REST
 * authorize() uses — so this route is intentionally exempt from the route-level
 * authorize() static guard (see tests/api-auth.test.ts).
 */
type GqlBody = { query?: unknown; variables?: unknown; operationName?: unknown };

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    let body: GqlBody;
    try {
      body = (await req.json()) as GqlBody;
    } catch {
      return apiError("Invalid JSON body");
    }
    if (typeof body.query !== "string") return apiError("Missing GraphQL query");

    const context: GqlContext = { auth };
    const result: ExecutionResult = await graphql({
      schema: fourtySchema(),
      source: body.query,
      contextValue: context,
      variableValues:
        body.variables && typeof body.variables === "object"
          ? (body.variables as Record<string, unknown>)
          : undefined,
      operationName: typeof body.operationName === "string" ? body.operationName : undefined,
    });
    // GraphQL transport: errors travel in the body; the HTTP status stays 200
    // unless the request itself was malformed (handled above).
    return json(result);
  });
}
