import type { MessageKey } from "@/lib/i18n";

/** A workspace member as lists show owners: everyone, including those who left. */
export type OwnerPerson = { id: string; name: string; active: boolean };

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * How a list names a record's owner. Someone who left keeps their name, marked
 * as gone, so their deals and tasks are not mistaken for unassigned ones.
 */
export function ownerLabel(ownerId: string | null, people: OwnerPerson[], t: T): string {
  if (!ownerId) return t("common.unassigned");
  const person = people.find((p) => p.id === ownerId);
  if (!person) return t("field.ownerInactive");
  return person.active ? person.name : t("owner.departed", { name: person.name });
}

/**
 * The owner of a row as returned to this reader: "—" when the field was
 * withheld from them (hidden by a field permission), like any hidden field,
 * rather than "Unassigned", which would be a claim about the record.
 */
export function ownerOf(row: { ownerId?: string | null }, people: OwnerPerson[], t: T): string {
  return Object.hasOwn(row, "ownerId") ? ownerLabel(row.ownerId ?? null, people, t) : "—";
}
