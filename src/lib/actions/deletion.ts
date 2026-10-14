import type { EventContext } from "@/lib/workflows/types";
import type { PayloadEnvelope } from "./types";

/**
 * What an action that sends a record to the Trash returns (a delete, or a
 * merge, whose duplicate goes there): its answer, and the record as it was for
 * the workflows and webhooks that start on its deletion. A dry run deleted
 * nothing and carries no record.
 */
export type Deletion<P> = PayloadEnvelope<P> & { snapshot: Record<string, unknown> | null };

export const nothingDeleted = <P>(payload: P): Deletion<P> => ({ payload, snapshot: null });

/** `also` adds to the record what a reader of the event needs, e.g. where a duplicate went. */
export const deleted = <P>(payload: P, record: Record<string, unknown>, also: Record<string, unknown> = {}): Deletion<P> => ({
  payload,
  snapshot: { ...record, custom: undefined, ...also },
});

/** The `<kind>.deleted` event of a deletion; none for a dry run. */
export function deletedEvents(kind: "contact" | "company" | "deal", out: Deletion<unknown>): EventContext[] {
  return out.snapshot ? [{ event: `${kind}.deleted`, entityType: kind, entityId: String(out.snapshot.id), snapshot: out.snapshot }] : [];
}
