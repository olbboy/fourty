import { z } from "zod";

/**
 * Input schemas for the operation shapes that are not "a record's fields":
 * listing, fetching one, deleting one. `src/lib/validators.ts` stays what it is
 * — the shape of a record — and these live here so the kernel owns the query
 * surface it validates.
 *
 * Query strings arrive as text, so the numeric bounds coerce. The values mirror
 * the REST list handlers, which are the reference implementation.
 */

/** Reference an existing record. */
export const byIdInput = z.object({ id: z.string().min(1) });

/**
 * Delete a record. Deleting is the default because the REST and GraphQL
 * handlers have always deleted outright; the MCP tool, where an agent is acting
 * on someone's behalf, flips the default so an unconfirmed call only reports
 * what it would remove.
 */
export const deleteInput = byIdInput.extend({ confirm: z.boolean().optional().default(true) });

/**
 * Contact list controls.
 *
 * `limit` and `sort` are deliberately unconstrained here: the REST list clamps
 * an oversized limit rather than rejecting it, and falls back to the default
 * sort for an unrecognised one. Encoding bounds as validation would turn calls
 * that work today into errors, so the clamping stays in the action.
 */
export const listContactsInput = z.object({
  q: z.string().max(200).optional(),
  // A limit that cannot be read as a number falls back to the default rather
  // than failing the request, which is how a query string has always behaved.
  limit: z.coerce.number().optional().catch(undefined),
  status: z.string().optional(),
  companyId: z.string().optional(),
  sort: z.string().optional(),
});
