"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CustomObjectDef, CustomObjectFieldDef, CustomRecord } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { PageHeader, Modal, EmptyState, Spinner, LoadError } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordForm } from "./record-form";
import { formatFieldValue, recordTitle } from "./shared";
import { useLocale, useT } from "@/lib/i18n/provider";

export function RecordsClient({ apiName }: { apiName: string }) {
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [object, setObject] = useState<CustomObjectDef | null>(null);
  const [fields, setFields] = useState<CustomObjectFieldDef[]>([]);
  const [records, setRecords] = useState<CustomRecord[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [columnKeys, setColumnKeys] = useState<string[] | null>(null);

  const applyView = useCallback((view: SavedView | null) => {
    setActiveView(view?.id ?? null);
    const cfg = view?.config ?? {};
    setQ(typeof cfg.filters?.q === "string" ? cfg.filters.q : "");
    setSort(cfg.sort ?? "updatedAt");
    setColumnKeys(Array.isArray(cfg.columns) ? cfg.columns.filter((k): k is string => typeof k === "string") : null);
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (sort) params.set("sort", sort);
    try {
      const recsRes = await fetch(`/api/objects/${apiName}?${params}`);
      if (recsRes.status === 404) {
        setMissing(true);
        return;
      }
      const objsRes = await fetch("/api/custom-objects");
      if (!recsRes.ok || !objsRes.ok) throw new Error("records");
      const recsBody = await recsRes.json();
      const objects = ((await objsRes.json()).objects ?? []) as CustomObjectDef[];
      const match = objects.find((o) => o.apiName === apiName);
      if (!match) {
        setMissing(true);
        return;
      }
      setObject(match);
      setRecords(recsBody.records ?? []);
      const fieldsRes = await fetch(`/api/custom-objects/${match.id}`);
      if (!fieldsRes.ok) throw new Error("fields");
      const fieldsBody = await fieldsRes.json();
      setFields((Array.isArray(fieldsBody.fields) ? fieldsBody.fields : []) as CustomObjectFieldDef[]);
    } catch {
      setFailed(true);
    }
  }, [apiName, q, sort]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  if (missing) {
    return <p className="py-10 text-center text-sm text-ink-muted">{t("page.objects.notFound")}</p>;
  }
  if (failed) {
    return (
      <LoadError
        onRetry={() => {
          setObject(null);
          setRecords(null);
          void load();
        }}
      />
    );
  }
  if (!object || !records) return <Spinner />;

  const defaultColumns = fields.slice(0, 4);
  const columns = columnKeys
    ? columnKeys.flatMap((key) => {
        const f = fields.find((x) => x.key === key);
        return f ? [f] : [];
      })
    : defaultColumns;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={object.namePlural}
        subtitle={`${records.length} ${records.length === 1 ? object.nameSingular.toLowerCase() : object.namePlural.toLowerCase()}`}
        actions={
          <Button onClick={() => setShowNew(true)} disabled={fields.length === 0}>
            <IconPlus width={15} height={15} />
            <span className="hidden sm:inline">{t("page.objects.new", { name: object.nameSingular.toLowerCase() })}</span>
            <span className="sm:hidden">{t("action.new")}</span>
          </Button>
        }
      />

      <SavedViewsBar
        entity={apiName}
        activeId={activeView}
        current={{
          filters: q.trim() ? { q: q.trim() } : {},
          sort,
          columns: (columnKeys ?? defaultColumns.map((f) => f.key)).slice(0, 40),
        }}
        onApply={applyView}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActiveView(null);
          }}
          aria-label={t("page.objects.searchAria", { name: object.namePlural.toLowerCase() })}
          placeholder={t("page.objects.searchPlaceholder")}
          className="max-w-xs"
        />
        <NativeSelect
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setActiveView(null);
          }}
          aria-label={t("page.objects.sortAria")}
        >
          <option value="updatedAt">{t("col.updated")}</option>
          <option value="createdAt">{t("page.objects.sortCreated")}</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {records.length === 0 ? (
        <EmptyState
          title={t("page.objects.empty", { name: object.namePlural.toLowerCase() })}
          hint={
            fields.length === 0
              ? t("page.objects.emptyHintFields")
              : t("page.objects.emptyHintNew", { name: object.nameSingular.toLowerCase() })
          }
        />
      ) : (
        <Card size="flush">
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow>
                {columns.length > 0 ? (
                  columns.map((col) => <TableHead key={col.id}>{col.label}</TableHead>)
                ) : (
                  <TableHead>{object.nameSingular}</TableHead>
                )}
                <TableHead>{t("col.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => router.push(`/objects/${apiName}/${row.id}`)}
                  className="cursor-pointer transition hover:bg-surface-2"
                >
                  {columns.length > 0 ? (
                    columns.map((col, i) => (
                      <TableCell key={col.id} className={i === 0 ? "font-medium" : "text-ink-muted"}>
                        {formatFieldValue(col, row.data[col.key], {
                          yes: t("page.objects.yes"),
                          no: t("page.objects.no"),
                          locale,
                        })}
                      </TableCell>
                    ))
                  ) : (
                    <TableCell className="font-medium">
                      {recordTitle(row.data, fields, t("page.objects.untitled"))}
                    </TableCell>
                  )}
                  <TableCell className="text-ink-muted">{timeAgo(row.updatedAt, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal
        title={t("page.objects.new", { name: object.nameSingular.toLowerCase() })}
        open={showNew}
        onClose={() => setShowNew(false)}
      >
        <RecordForm
          apiName={apiName}
          fields={fields}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>
    </div>
  );
}
