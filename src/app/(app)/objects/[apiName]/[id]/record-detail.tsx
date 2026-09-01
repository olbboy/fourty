"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CustomObjectDef, CustomObjectFieldDef, CustomRecord } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { Modal, Spinner, LoadError, useConfirm } from "@/components/ui";
import { NotesPanel, TasksPanel, LogTouchpoint } from "@/components/record-panels";
import { RecordTabs } from "@/components/agent-panel/record-tabs";
import { IconEdit, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordForm } from "../record-form";
import { formatFieldValue, recordTitle } from "../shared";
import { useLocale, useT } from "@/lib/i18n/provider";

export function RecordDetail({ apiName, id }: { apiName: string; id: string }) {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const [object, setObject] = useState<CustomObjectDef | null>(null);
  const [fields, setFields] = useState<CustomObjectFieldDef[]>([]);
  const [record, setRecord] = useState<CustomRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const recRes = await fetch(`/api/objects/${apiName}/${id}`);
      if (recRes.status === 404) {
        setMissing(true);
        return;
      }
      if (!recRes.ok) throw new Error("record");
      setRecord((await recRes.json()).record);
      const objsRes = await fetch("/api/custom-objects");
      if (!objsRes.ok) throw new Error("objects");
      const objects = ((await objsRes.json()).objects ?? []) as CustomObjectDef[];
      const match = objects.find((o) => o.apiName === apiName);
      if (!match) {
        setMissing(true);
        return;
      }
      setObject(match);
      const fieldsRes = await fetch(`/api/custom-objects/${match.id}`);
      if (!fieldsRes.ok) throw new Error("fields");
      const fieldsBody = await fieldsRes.json();
      setFields((Array.isArray(fieldsBody.fields) ? fieldsBody.fields : []) as CustomObjectFieldDef[]);
    } catch {
      setFailed(true);
    }
  }, [apiName, id]);

  useEffect(() => {
    load();
  }, [load]);

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    load();
  }, [load]);

  async function remove() {
    const ok = await askConfirm({
      title: t("record.deleteAria", { name: object?.nameSingular ?? t("page.objects.untitled") }),
      body: t("common.confirmDelete"),
    });
    if (!ok) return;
    await fetch(`/api/objects/${apiName}/${id}`, { method: "DELETE" });
    router.push(`/objects/${apiName}`);
  }

  if (missing) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        {t("record.notFound")}{" "}
        <Link href={`/objects/${apiName}`} className="text-accent-700 underline">
          {t("common.back")}
        </Link>
      </p>
    );
  }
  if (failed) {
    return (
      <LoadError
        onRetry={() => {
          setObject(null);
          setRecord(null);
          void load();
        }}
      />
    );
  }
  if (!object || !record) return <Spinner />;

  const boolLabels = { yes: t("page.objects.yes"), no: t("page.objects.no"), locale };
  const title = recordTitle(record.data, fields, t("page.objects.untitled"));

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Link href={`/objects/${apiName}`} className="hover:underline">
              {object.namePlural}
            </Link>
          </p>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
          <p className="text-sm text-ink-muted">{t("record.updated", { when: timeAgo(record.updatedAt, locale) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setEditing(true)} variant="outline">
            <IconEdit width={15} height={15} /> {t("action.edit")}
          </Button>
          <Button
            onClick={remove}
            aria-label={t("record.deleteAria", { name: title })}
            variant="outline"
            size="icon"
            className="text-feedback-error"
          >
            <IconTrash width={15} height={15} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card size="flush" className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t("record.details")}</h2>
          {fields.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("record.noFields")}</p>
          ) : (
            fields.map((field) => {
              const value = record.data[field.key];
              return (
                <div key={field.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{field.label}</p>
                  <p className="mt-0.5 text-sm">
                    {field.type === "url" && typeof value === "string" && value ? (
                      <a href={value} className="text-accent-700 underline" target="_blank" rel="noreferrer">
                        {value}
                      </a>
                    ) : (
                      formatFieldValue(field, value, boolLabels)
                    )}
                  </p>
                </div>
              );
            })
          )}
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.activity")}</h2>
            <LogTouchpoint entityType={apiName} entityId={id} onLogged={bump} />
          </Card>
          <RecordTabs entityType={apiName} entityId={id} refreshKey={refreshKey} onChanged={bump} />
        </div>
        <Card size="flush" className="p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{t("record.notes")}</h2>
          <NotesPanel entityType={apiName} entityId={id} onChanged={bump} />
        </Card>
        <Card size="flush" className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("record.tasks")}</h2>
          <TasksPanel entityType={apiName} entityId={id} onChanged={bump} />
        </Card>
      </div>

      <Modal
        title={t("page.objects.edit", { name: object.nameSingular.toLowerCase() })}
        open={editing}
        onClose={() => setEditing(false)}
      >
        <RecordForm
          apiName={apiName}
          fields={fields}
          record={record}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      </Modal>
      {confirmDialog}
    </div>
  );
}
