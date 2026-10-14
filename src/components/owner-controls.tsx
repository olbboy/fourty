"use client";

import { useEffect, useState } from "react";
import { Field, useConfirm } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/lib/i18n/provider";
import { ownerLabel, type OwnerPerson } from "@/lib/owner-display";
import type { BulkObject } from "@/lib/actions/bulk";

/**
 * Everyone who has been a member of the workspace, with whether they still are.
 * Lists name owners from it (people who left keep their name); only active
 * members are offered as a new owner.
 */
export function useOwnerPeople(): OwnerPerson[] {
  const [people, setPeople] = useState<OwnerPerson[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tasks/assignees?all=1", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        const list = (data as { assignees?: unknown } | null)?.assignees;
        if (Array.isArray(list)) setPeople(list as OwnerPerson[]);
      })
      // Names are a nicety: without them a list still shows its records.
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return people;
}

/**
 * The Owner select of a record form, named `ownerId` for the form to read. A
 * new record's empty choice means "me"; an existing record's means unassigned.
 * The form sends `ownerId` only when the choice moves off `initialOwnerId`.
 */
export function OwnerField({ initialOwnerId, isNew, disabled }: { initialOwnerId: string; isNew: boolean; disabled?: boolean }) {
  const t = useT();
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tasks/assignees", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: unknown) => {
        const list = (payload as { assignees?: unknown } | null)?.assignees;
        if (Array.isArray(list)) setAssignees(list as { id: string; name: string }[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAssignees([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <Field label={t("field.owner")}>
      <NativeSelect
        name="ownerId"
        // Remount once members load so the saved owner can be selected.
        key={assignees.length}
        defaultValue={initialOwnerId}
        className="w-full"
        disabled={disabled}
      >
        <option value="">{isNew ? t("field.ownerMe") : t("common.unassigned")}</option>
        {initialOwnerId && assignees.length > 0 && !assignees.some((a) => a.id === initialOwnerId) && (
          <option value={initialOwnerId}>{t("field.ownerInactive")}</option>
        )}
        {assignees.map((assignee) => (
          <option key={assignee.id} value={assignee.id}>
            {assignee.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** Reads an OwnerField: undefined when unchanged, null for unassigned. */
export function ownerFromForm(form: FormData, initialOwnerId: string): string | null | undefined {
  const owner = form.get("ownerId");
  if (typeof owner !== "string" || owner === initialOwnerId) return undefined;
  return owner || null;
}

/** "All owners", "Unassigned", then everyone by name, people who left marked. */
export function OwnerFilter({
  value,
  onChange,
  people,
}: {
  value: string;
  onChange: (value: string) => void;
  people: OwnerPerson[];
}) {
  const t = useT();
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("owner.filterAria")}>
      <option value="">{t("owner.filterAll")}</option>
      <option value="none">{t("common.unassigned")}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {ownerLabel(person.id, people, t)}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Give many records one owner; true when every one of them moved. */
export async function reassignOwner(
  kind: BulkObject,
  ids: string[],
  ownerId: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/${kind}/reassign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, ownerId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete many records into the Trash; true when every one of them went. */
export async function bulkDelete(kind: BulkObject, ids: string[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/${kind}/bulk-delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Shown while rows are selected (or a filter narrows the list): hand them all
 * to one active member or to nobody, delete them into the Trash, and whatever
 * else the list adds as `children`. The server changes all of them or none, so
 * a failure changed nothing.
 */
export function BulkBar({
  count,
  people,
  onReassign,
  onDelete,
  onClear,
  label,
  actions = [],
  children,
}: {
  count: number;
  people: OwnerPerson[];
  /** Omitted when the caller may not reassign. */
  onReassign?: (ownerId: string | null) => Promise<boolean>;
  /** Omitted when the list offers no bulk delete. */
  onDelete?: () => Promise<boolean>;
  /** Clears a row selection; omitted when the bar acts on every row shown. */
  onClear?: () => void;
  /** Overrides "N selected", e.g. "N shown"; "" when the list already says it. */
  label?: string;
  /** More one-click changes, e.g. "Mark done"; they share the bar's busy and failure state. */
  actions?: { label: string; run: () => Promise<boolean> }[];
  children?: React.ReactNode;
}) {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (count === 0) return null;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    if (!ok) setFailed(true);
    return ok;
  }

  return (
    <div
      role="region"
      aria-label={t("owner.bulkRegion")}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2 text-sm"
    >
      {label !== "" && <span className="font-medium">{label ?? t("owner.bulkSelected", { count })}</span>}
      {onReassign && (
        <>
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t("owner.bulkTargetAria")} size="sm">
            <option value="">{t("owner.bulkChoose")}</option>
            <option value="none">{t("common.unassigned")}</option>
            {people
              .filter((person) => person.active)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </NativeSelect>
          <Button
            size="sm"
            disabled={!target || busy}
            onClick={() => void run(() => onReassign(target === "none" ? null : target)).then((ok) => ok && setTarget(""))}
          >
            {t("owner.bulkApply")}
          </Button>
        </>
      )}
      {actions.map((action) => (
        <Button key={action.label} size="sm" variant="outline" disabled={busy} onClick={() => void run(action.run)}>
          {action.label}
        </Button>
      ))}
      {children}
      {onDelete && (
        <Button
          size="sm"
          variant="outline"
          className="text-feedback-error"
          disabled={busy}
          onClick={async () => {
            const ok = await askConfirm({ title: t("bulk.deleteTitle", { count }), body: t("common.confirmTrash") });
            if (ok) await run(onDelete);
          }}
        >
          {t("bulk.delete")}
        </Button>
      )}
      {onClear && (
        <Button size="sm" variant="ghost" onClick={onClear}>
          {t("owner.bulkClear")}
        </Button>
      )}
      {failed && (
        <span role="alert" className="text-feedback-error">
          {t("owner.bulkFailed")}
        </span>
      )}
      {confirmDialog}
    </div>
  );
}
