"use client";

import { useCallback, useEffect, useState } from "react";
import type { FieldAccessObject, FieldAccessResponse, ObjectFieldAccess } from "@/lib/field-access";

const EMPTY: ObjectFieldAccess = { ready: false, failed: false, hidden: new Set(), blockedWrites: new Set(), canUpdate: false, canDelete: false };

export type FieldAccessState = ObjectFieldAccess & { retry: () => void };

/** Load hide/freeze sets for one object. Submit must wait for `ready`. */
export function useFieldAccess(object: FieldAccessObject): FieldAccessState {
  const [access, setAccess] = useState<ObjectFieldAccess>(EMPTY);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/field-permissions/me")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: FieldAccessResponse) => {
        if (cancelled) return;
        setAccess({
          ready: true,
          failed: false,
          hidden: new Set(d.hidden?.[object] ?? []),
          blockedWrites: new Set(d.blockedWrites?.[object] ?? []),
          canUpdate: d.allowed?.[object]?.update ?? false,
          canDelete: d.allowed?.[object]?.delete ?? false,
        });
      })
      .catch(() => {
        // Stay not-ready: empty hide/freeze sets with ready:true would fail open.
        if (!cancelled) setAccess({ ready: false, failed: true, hidden: new Set(), blockedWrites: new Set(), canUpdate: false, canDelete: false });
      });
    return () => {
      cancelled = true;
    };
  }, [object, tick]);

  return { ...access, retry };
}

/** What the caller's role may do on the tasks list (false until loaded or on failure). */
export function useTasksAllowed(): { update: boolean; delete: boolean } {
  const [allowed, setAllowed] = useState({ update: false, delete: false });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/field-permissions/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FieldAccessResponse | null) => {
        if (!cancelled && d?.allowed?.tasks) setAllowed(d.allowed.tasks);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return allowed;
}
