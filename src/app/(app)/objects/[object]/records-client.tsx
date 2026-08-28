"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { formatDate, timeAgo, toDateInputValue, fromDateInputValue } from "@/lib/format";
import { PageHeader, Modal, EmptyState, Spinner, useConfirm } from "@/components/ui";
import { CustomFieldsInputs } from "@/components/custom-fields";
import { IconPlus, IconTrash, IconEdit, IconSettings } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomObjectDef, ObjectFieldDef } from "../../settings/sections/custom-objects";

/**
 * Generic list + record editing for one custom object (ADR-007). The form is
 * CustomFieldsInputs — the same renderer custom fields use on contacts — driven
 * by this object's field definitions, so a new field shows up here with no code.
 * Validation stays on the server (validateRecord); its 400 message is surfaced
 * verbatim under the form.
 */

type RecordRow = { id: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };

/** How many field columns the table shows before it gets unwieldy. */
const MAX_COLUMNS = 5;

/** Coerce ObjectFieldDef to the shape CustomFieldsInputs renders (entity unused). */
function toInputDefs(fields: ObjectFieldDef[], apiName: string): CustomFieldDef[] {
  return fields.map((f) => ({ ...f, entity: apiName }));
}

function cellText(field: ObjectFieldDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "checkbox") return value === true ? "Yes" : "No";
  if (field.type === "date") return formatDate(value as number);
  return String(value);
}

/**
 * Whether a stored value is safe to put in an href. The server only ever writes
 * http(s) into a url field, but a field can be retyped to `url` over the API
 * without its existing values being revalidated — so a `javascript:` string
 * left over from a text field must never become a live link. Checked here at the
 * point of render, not trusted from the field's current type.
 */
function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function RecordsClient({ apiName }: { apiName: string }) {
  const [askConfirm, confirmDialog] = useConfirm();
  const [object, setObject] = useState<CustomObjectDef | null | undefined>(undefined);
  const [fields, setFields] = useState<ObjectFieldDef[] | null>(null);
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [editing, setEditing] = useState<RecordRow | "new" | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRecords = useCallback(async () => {
    const res = await fetch(`/api/objects/${apiName}`);
    if (res.ok) setRecords((await res.json()).records);
  }, [apiName]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/custom-objects");
      if (!res.ok) return setObject(null);
      const found = ((await res.json()).objects as CustomObjectDef[]).find(
        (o) => o.apiName === apiName,
      );
      setObject(found ?? null);
      if (!found) return;
      const detail = await fetch(`/api/custom-objects/${found.id}`);
      if (detail.ok) setFields((await detail.json()).fields);
      loadRecords();
    })();
  }, [apiName, loadRecords]);

  function openNew() {
    setError(null);
    setValues({});
    setEditing("new");
  }

  function openEdit(record: RecordRow) {
    setError(null);
    // Date fields are stored as epoch millis; a date input wants YYYY-MM-DD.
    const seeded: Record<string, unknown> = { ...record.data };
    for (const f of fields ?? []) {
      if (f.type === "date" && typeof seeded[f.key] === "number") {
        seeded[f.key] = toDateInputValue(seeded[f.key] as number);
      }
    }
    setValues(seeded);
    setEditing(record);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const isNew = editing === "new";
    // Date inputs hold YYYY-MM-DD; store noon-local epoch so the day survives the
    // round trip through the server and back (see fromDateInputValue/toDateInputValue).
    const payload: Record<string, unknown> = { ...values };
    for (const f of fields ?? []) {
      if (f.type === "date" && typeof payload[f.key] === "string" && payload[f.key]) {
        payload[f.key] = fromDateInputValue(payload[f.key] as string);
      }
    }
    const res = await fetch(
      isNew ? `/api/objects/${apiName}` : `/api/objects/${apiName}/${(editing as RecordRow).id}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: payload }),
      },
    );
    setBusy(false);
    if (res.ok) {
      setEditing(null);
      loadRecords();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save");
    }
  }

  async function remove(record: RecordRow) {
    const ok = await askConfirm({
      title: `Delete this ${object?.nameSingular.toLowerCase() ?? "record"}?`,
      body: "The record is deleted permanently.",
    });
    if (!ok) return;
    await fetch(`/api/objects/${apiName}/${record.id}`, { method: "DELETE" });
    loadRecords();
  }

  if (object === undefined) return <Spinner />;
  if (object === null) {
    return (
      <EmptyState
        title="Object not found"
        hint={`No custom object answers to “${apiName}”. It may have been deleted, or not created yet.`}
        action={
          <Link href="/settings" className="text-sm font-medium text-accent-600 hover:underline">
            Manage custom objects in Settings
          </Link>
        }
      />
    );
  }

  const columns = (fields ?? []).slice(0, MAX_COLUMNS);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={object.namePlural}
        subtitle={object.description ?? (records ? `${records.length} records` : undefined)}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
              aria-label={`Manage ${object.namePlural} fields in Settings`}
            >
              <IconSettings width={15} height={15} /> Fields
            </Link>
            <Button onClick={openNew}>
              <IconPlus width={15} height={15} /> New {object.nameSingular.toLowerCase()}
            </Button>
          </div>
        }
      />

      {!records || !fields ? (
        <Spinner />
      ) : records.length === 0 ? (
        <EmptyState
          title={`No ${object.namePlural.toLowerCase()} yet`}
          hint={
            fields.length === 0
              ? "Add fields to this object in Settings, then create the first record."
              : `Create the first ${object.nameSingular.toLowerCase()} to get started.`
          }
          action={
            fields.length > 0 ? (
              <Button onClick={openNew}>
                <IconPlus width={15} height={15} /> New {object.nameSingular.toLowerCase()}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card size="flush" className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((f) => (
                  <TableHead key={f.id}>{f.label}</TableHead>
                ))}
                <TableHead>Updated</TableHead>
                <TableHead className="w-20 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id} data-testid="object-record">
                  {columns.map((f, i) => (
                    <TableCell key={f.id} className={i === 0 ? "font-medium" : undefined}>
                      {f.type === "url" && isSafeHttpUrl(r.data[f.key]) ? (
                        <a
                          href={r.data[f.key] as string}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-600 hover:underline"
                        >
                          {cellText(f, r.data[f.key])}
                        </a>
                      ) : (
                        cellText(f, r.data[f.key])
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-ink-muted">{timeAgo(r.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        onClick={() => openEdit(r)}
                        aria-label={`Edit ${object.nameSingular.toLowerCase()}`}
                        variant="outline"
                        size="icon-sm"
                      >
                        <IconEdit width={14} height={14} />
                      </Button>
                      <Button
                        onClick={() => remove(r)}
                        aria-label={`Delete ${object.nameSingular.toLowerCase()}`}
                        variant="outline"
                        size="icon-sm"
                        className="text-feedback-error"
                      >
                        <IconTrash width={14} height={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal
        title={
          editing === "new"
            ? `New ${object.nameSingular.toLowerCase()}`
            : `Edit ${object.nameSingular.toLowerCase()}`
        }
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={save} className="space-y-4">
          {fields && fields.length > 0 ? (
            <CustomFieldsInputs
              defs={toInputDefs(fields, apiName)}
              values={values}
              onChange={setValues}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              This object has no fields yet — add some in Settings first.
            </p>
          )}
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (fields ?? []).length === 0}>
              {busy ? "Saving…" : editing === "new" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </div>
  );
}
