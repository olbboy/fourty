/**
 * Names of the patch fields whose value actually differs from the stored row.
 *
 * Drives three side effects that must agree across REST, GraphQL, and MCP: the
 * activity entry is only written when something really changed, `audit.meta`
 * records which fields moved, and the workflow snapshot carries them as
 * `changedFields`. The REST handlers compute this inline; this helper keeps the
 * other surfaces from drifting away from that definition.
 */
export function changedKeys(patch: Record<string, unknown>, existing: unknown): string[] {
  const row = existing as Record<string, unknown>;
  return Object.keys(patch).filter((k) => patch[k] !== row[k]);
}
