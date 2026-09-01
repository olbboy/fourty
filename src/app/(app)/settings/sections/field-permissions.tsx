"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal, Field, Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { fieldPermsRoleLabel, formatFieldPermsError } from "@/lib/field-perms-display";

const OBJECTS = ["contacts", "companies", "deals"] as const;
type FieldPermObject = (typeof OBJECTS)[number];
type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

type Rule = {
  id: string;
  object: FieldPermObject;
  field: string;
  role: "member" | "viewer";
  canRead: boolean;
  canWrite: boolean;
};

type Access = "hidden" | "readonly";

const OBJECT_NAV: Record<FieldPermObject, MessageKey> = {
  contacts: "nav.contacts",
  companies: "nav.companies",
  deals: "nav.deals",
};

/** Top-level keys `redact()` actually sees. Custom-field keys live inside `custom`. */
const FIELDS: Record<FieldPermObject, { key: string; label: MessageKey }[]> = {
  contacts: [
    { key: "email", label: "field.email" },
    { key: "phone", label: "field.phone" },
    { key: "jobTitle", label: "field.jobTitle" },
    { key: "linkedin", label: "field.linkedin" },
    { key: "status", label: "field.status" },
    { key: "source", label: "field.source" },
    { key: "score", label: "settings.fieldPermsLeadScore" },
    { key: "firstName", label: "field.firstName" },
    { key: "lastName", label: "field.lastName" },
    { key: "companyId", label: "field.company" },
    { key: "city", label: "field.city" },
    { key: "country", label: "field.country" },
    { key: "custom", label: "settings.fieldPermsCustomAll" },
  ],
  companies: [
    { key: "name", label: "field.name" },
    { key: "domain", label: "field.domain" },
    { key: "industry", label: "field.industry" },
    { key: "size", label: "field.size" },
    { key: "annualRevenue", label: "field.annualRevenue" },
    { key: "website", label: "field.website" },
    { key: "linkedin", label: "field.linkedin" },
    { key: "city", label: "field.city" },
    { key: "country", label: "field.country" },
    { key: "custom", label: "settings.fieldPermsCustomAll" },
  ],
  deals: [
    { key: "name", label: "field.name" },
    { key: "amount", label: "field.amount" },
    { key: "currency", label: "field.currency" },
    { key: "expectedCloseDate", label: "field.expectedClose" },
    { key: "stageId", label: "field.stage" },
    { key: "pipelineId", label: "field.pipeline" },
    { key: "companyId", label: "field.company" },
    { key: "contactId", label: "settings.fieldPermsContact" },
    { key: "score", label: "settings.fieldPermsHealthScore" },
    { key: "custom", label: "settings.fieldPermsCustomAll" },
  ],
};

function fieldLabel(object: string, field: string, t: TFn): string {
  const list = FIELDS[object as FieldPermObject];
  const hit = list?.find((f) => f.key === field);
  return hit ? t(hit.label) : field;
}

function accessLabel(rule: Rule, t: TFn): string {
  if (!rule.canRead) return rule.canWrite ? t("settings.fieldPermsWriteonly") : t("settings.fieldPermsHidden");
  return rule.canWrite ? t("settings.fieldPermsAllowed") : t("settings.fieldPermsReadonly");
}

// Admin-only (Gate D1). A non-admin gets a 403 from the list and sees nothing,
// the same contract SSO and members use — the API stays the source of truth.
export function FieldPermissionsSection() {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [object, setObject] = useState<FieldPermObject>("contacts");
  const [field, setField] = useState(FIELDS.contacts[0].key);
  const [role, setRole] = useState<"member" | "viewer">("viewer");
  const [access, setAccess] = useState<Access>("hidden");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/field-permissions");
      if (res.status === 403) {
        setAdminOnly(true);
        return;
      }
      if (!res.ok) throw new Error("field-permissions");
      setRules((await res.json()).rules);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setObject("contacts");
    setField(FIELDS.contacts[0].key);
    setRole("viewer");
    setAccess("hidden");
    setError(null);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/field-permissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object,
        field,
        role,
        canRead: access === "readonly",
        canWrite: false,
      }),
    });
    if (res.ok) {
      setShowNew(false);
      resetForm();
      load();
    } else {
      setError(formatFieldPermsError((await res.json().catch(() => ({}))).error, t, "settings.fieldPermsFailedSave"));
    }
  }

  async function clear(rule: Rule) {
    const ok = await askConfirm({
      title: t("settings.fieldPermsAllowTitle", {
        role: fieldPermsRoleLabel(rule.role, t),
        field: fieldLabel(rule.object, rule.field, t),
      }),
      body: t("settings.fieldPermsAllowBody"),
      confirmLabel: t("settings.fieldPermsAllow"),
    });
    if (!ok) return;
    setError(null);
    const res = await fetch("/api/field-permissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: rule.object,
        field: rule.field,
        role: rule.role,
        canRead: true,
        canWrite: true,
      }),
    });
    if (!res.ok) {
      setError(formatFieldPermsError((await res.json().catch(() => ({}))).error, t, "settings.fieldPermsFailedClear"));
    }
    load();
  }

  if (adminOnly) return null;

  const fields = FIELDS[object];

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("settings.fieldPerms")}</h2>
          <p className="text-sm text-ink-muted">{t("settings.fieldPermsHint")}</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowNew(true);
          }}
        >
          <IconPlus width={15} height={15} /> {t("settings.fieldPermsAdd")}
        </Button>
      </div>
      {error && !showNew && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {failed ? (
        <LoadError
          onRetry={() => {
            setRules(null);
            void load();
          }}
        />
      ) : !rules ? (
        <Spinner />
      ) : rules.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t("settings.fieldPermsEmpty")}</p>
      ) : (
        <div className="divide-y divide-line/60">
          {rules.map((rule) => (
            <div
              key={rule.id}
              data-testid="field-permission"
              data-object={rule.object}
              data-field={rule.field}
              data-role={rule.role}
              className="flex flex-wrap items-center gap-3 py-2.5"
            >
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm font-medium">
                  {fieldLabel(rule.object, rule.field, t)}
                  <span className="font-normal text-ink-muted"> · {t(OBJECT_NAV[rule.object])}</span>
                </p>
                <p className="text-xs text-ink-muted">
                  {fieldPermsRoleLabel(rule.role, t)} · {accessLabel(rule, t)}
                  <span className="ml-1 font-mono">{rule.object}.{rule.field}</span>
                </p>
              </div>
              <Button
                onClick={() => clear(rule)}
                aria-label={t("settings.fieldPermsAllowAria", {
                  role: fieldPermsRoleLabel(rule.role, t),
                  object: rule.object,
                  field: rule.field,
                })}
                variant="outline"
                size="icon-sm"
                className="text-feedback-error"
              >
                <IconTrash width={14} height={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={t("settings.fieldPermsModal")}
        open={showNew}
        onClose={() => {
          setShowNew(false);
          resetForm();
        }}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label={t("settings.fieldPermsObject")}>
            <NativeSelect
              name="object"
              value={object}
              onChange={(e) => {
                const next = e.target.value as FieldPermObject;
                setObject(next);
                setField(FIELDS[next][0].key);
              }}
              className="w-full"
            >
              {OBJECTS.map((o) => (
                <option key={o} value={o}>
                  {t(OBJECT_NAV[o])}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("settings.fieldPermsField")}>
            <NativeSelect
              name="field"
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full"
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {t(f.label)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("settings.fieldPermsRole")}>
            <NativeSelect
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "viewer")}
              className="w-full"
            >
              <option value="viewer">{t("settings.roleViewer")}</option>
              <option value="member">{t("settings.roleMember")}</option>
            </NativeSelect>
          </Field>
          <Field label={t("settings.fieldPermsAccess")}>
            <NativeSelect
              name="access"
              value={access}
              onChange={(e) => setAccess(e.target.value as Access)}
              className="w-full"
            >
              <option value="hidden">{t("settings.fieldPermsHiddenOption")}</option>
              <option value="readonly">{t("settings.fieldPermsReadonlyOption")}</option>
            </NativeSelect>
          </Field>
          {error && showNew && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">{t("settings.fieldPermsAdd")}</Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}
