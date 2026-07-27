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

/** Delete a record. `confirm` exists for MCP's dry-run; other surfaces ignore it. */
export const deleteInput = byIdInput.extend({ confirm: z.boolean().optional() });

/** Shared list controls. Entity-specific filters extend this. */
export const listInput = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(200),
});

export const listContactsInput = listInput.extend({
  status: z.enum(["lead", "qualified", "customer", "churned"]).optional(),
  companyId: z.string().optional(),
  sort: z.enum(["updatedAt", "createdAt", "name", "score"]).optional().default("updatedAt"),
});
