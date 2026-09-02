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
  // No length bound: none of the handlers this replaced had one, and refusing a
  // long search term would reject requests that used to simply find nothing.
  q: z.string().optional(),
  // A limit that cannot be read as a number falls back to the default rather
  // than failing the request, which is how a query string has always behaved.
  limit: z.coerce.number().optional().catch(undefined),
  status: z.string().optional(),
  companyId: z.string().optional(),
  sort: z.string().optional(),
});

/** Company list controls. Same clamping rules as the contact list. */
export const listCompaniesInput = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().optional().catch(undefined),
  industry: z.string().optional(),
  sort: z.string().optional(),
});

/** Deal list controls. REST default/max (300/1000) live in the action, not here. */
export const listDealsInput = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().optional().catch(undefined),
  stageId: z.string().optional(),
  pipelineId: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
});

/**
 * Task list controls. REST defaults to open tasks sorted by due date; MCP and
 * GraphQL pass `state=all` and `sort=createdAt` through their adapters.
 */
export const listTasksInput = z.object({
  state: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().optional().catch(undefined),
  sort: z.string().optional(),
});

/** Note list. Both entityType and entityId are required to return rows (REST). */
export const listNotesInput = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().optional().catch(undefined),
});

/** Activity timeline. Same keys as notes: no record, no rows. */
export const listActivitiesInput = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().optional().catch(undefined),
});
