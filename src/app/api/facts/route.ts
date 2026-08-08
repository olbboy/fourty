import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { factsList, factsRecord } from "@/lib/actions/facts";

/**
 * The evidence ledger over REST (ADR-018). Both handlers are the shared action
 * definitions — the guard chain, the invariants and the audit trail are the same
 * ones MCP and the AI agent get, because there is only one implementation.
 */
const listFacts = toRouteHandler(factsList, { body: (facts) => ({ facts }) });
const recordFact = toRouteHandler(factsRecord, { status: 201, body: (result) => ({ result }) });

// Narrowed to one argument: this route has no dynamic segment, and Next checks
// the exported handler's signature against the route's own parameters.
export const GET = (req: Request) => listFacts(req);
export const POST = (req: Request) => recordFact(req);
