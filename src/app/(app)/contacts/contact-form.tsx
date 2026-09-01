"use client";

import { useState } from "react";
import Link from "next/link";
import type { Contact, Company } from "@/lib/types";
import { unackedNameCompanyDuplicate } from "@/lib/duplicates";
import { stripBlockedWrites } from "@/lib/field-access";
import { useFieldAccess } from "@/hooks/use-field-access";
import { Field, LoadError } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

export function ContactForm({
  contact,
  companies,
  onSaved,
}: {
  contact?: Contact;
  companies: Company[];
  onSaved: () => void;
}) {
  const t = useT();
  const { defs, failed, retry } = useCustomFields("contact");
  const access = useFieldAccess("contacts");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameDupe, setNameDupe] = useState<{ id: string; name: string } | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>(contact?.custom ?? {});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const val = (k: string) => (f.get(k) as string)?.trim() || null;
    const body = {
      firstName: val("firstName") ?? "",
      lastName: (f.get("lastName") as string)?.trim() ?? "",
      email: val("email"),
      phone: val("phone"),
      jobTitle: val("jobTitle"),
      companyId: val("companyId"),
      status: val("status") ?? "lead",
      source: val("source"),
      linkedin: val("linkedin"),
      city: val("city"),
      country: val("country"),
      custom,
    };

    if (body.companyId && body.firstName && body.lastName) {
      const q = `${body.firstName} ${body.lastName}`.trim();
      const list = await fetch(
        `/api/contacts?q=${encodeURIComponent(q)}&companyId=${encodeURIComponent(body.companyId)}`,
      );
      if (list.ok) {
        const candidates = ((await list.json()).contacts ?? []) as Contact[];
        const hit = unackedNameCompanyDuplicate(
          {
            id: contact?.id ?? "",
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            companyId: body.companyId,
          },
          candidates,
          nameDupe?.id ?? null,
        );
        if (hit) {
          setNameDupe({
            id: hit.contact.id,
            name: `${hit.contact.firstName} ${hit.contact.lastName}`.trim(),
          });
          setBusy(false);
          return;
        }
      }
    }

    const res = await fetch(contact ? `/api/contacts/${contact.id}` : "/api/contacts", {
      method: contact ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stripBlockedWrites(body, access.blockedWrites)),
    });
    if (res.ok) onSaved();
    else {
      setError((await res.json().catch(() => ({}))).error ?? t("form.failedSave"));
      setBusy(false);
    }
  }

  if (access.failed) return <LoadError compact onRetry={access.retry} />;

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(!contact || !access.hidden.has("firstName")) && (
        <Field label={t("field.firstName")}>
          <Input
            name="firstName"
            required={!contact}
            disabled={!!contact && access.blockedWrites.has("firstName")}
            defaultValue={contact?.firstName}
          />
        </Field>
      )}
      {!access.hidden.has("lastName") && (
        <Field label={t("field.lastName")}>
          <Input name="lastName" disabled={access.blockedWrites.has("lastName")} defaultValue={contact?.lastName} />
        </Field>
      )}
      {!access.hidden.has("email") && (
        <Field label={t("field.email")}>
          <Input name="email" type="email" disabled={access.blockedWrites.has("email")} defaultValue={contact?.email ?? ""} />
        </Field>
      )}
      {!access.hidden.has("phone") && (
        <Field label={t("field.phone")}>
          <Input name="phone" disabled={access.blockedWrites.has("phone")} defaultValue={contact?.phone ?? ""} />
        </Field>
      )}
      {!access.hidden.has("jobTitle") && (
        <Field label={t("field.jobTitle")}>
          <Input name="jobTitle" disabled={access.blockedWrites.has("jobTitle")} defaultValue={contact?.jobTitle ?? ""} />
        </Field>
      )}
      {!access.hidden.has("companyId") && (
        <Field label={t("field.company")}>
          <NativeSelect
            name="companyId"
            defaultValue={contact?.companyId ?? ""}
            className="w-full"
            disabled={access.blockedWrites.has("companyId")}
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("status") && (
      <Field label={t("field.status")}>
        <NativeSelect name="status" defaultValue={contact?.status ?? "lead"} className="w-full" disabled={access.blockedWrites.has("status")}>
          <option value="lead">{t("status.lead")}</option>
          <option value="qualified">{t("status.qualified")}</option>
          <option value="customer">{t("status.customer")}</option>
          <option value="churned">{t("status.churned")}</option>
        </NativeSelect>
      </Field>
      )}
      {!access.hidden.has("source") && (
      <Field label={t("field.source")}>
        <NativeSelect name="source" defaultValue={contact?.source ?? ""} className="w-full" disabled={access.blockedWrites.has("source")}>
          <option value="">—</option>
          <option value="website">{t("source.website")}</option>
          <option value="referral">{t("source.referral")}</option>
          <option value="outbound">{t("source.outbound")}</option>
          <option value="event">{t("source.event")}</option>
          <option value="other">{t("source.other")}</option>
        </NativeSelect>
      </Field>
      )}
      {!access.hidden.has("linkedin") && (
      <Field label={t("field.linkedin")}>
        <Input name="linkedin" disabled={access.blockedWrites.has("linkedin")} defaultValue={contact?.linkedin ?? ""} />
      </Field>
      )}
      {!access.hidden.has("city") && (
        <Field label={t("field.city")}>
          <Input name="city" disabled={access.blockedWrites.has("city")} defaultValue={contact?.city ?? ""} />
        </Field>
      )}
      {!access.hidden.has("country") && (
        <Field label={t("field.country")}>
          <Input name="country" disabled={access.blockedWrites.has("country")} defaultValue={contact?.country ?? ""} />
        </Field>
      )}
      {!access.hidden.has("custom") && (
        <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} failed={failed} onRetry={retry} />
      )}
      {nameDupe && (
        <p className="col-span-full text-sm" data-testid="name-company-duplicate">
          {t("form.dupeNameCompany", { name: nameDupe.name })}{" "}
          <Link href={`/contacts/${nameDupe.id}`} className="font-medium text-accent-700 underline dark:text-accent-400">
            {t("form.openExisting")}
          </Link>
          . {t("form.dupeSubmitAgain", { action: contact ? t("form.dupeSave") : t("form.dupeCreate") })}
        </p>
      )}
      {error && (
        <p className="col-span-full text-sm text-feedback-error">
          {error}
          {/already exists \(([^)]+)\)/.test(error) && (
            <>
              {" "}
              <Link
                href={`/contacts/${error.match(/already exists \(([^)]+)\)/)![1]}`}
                className="font-medium underline"
              >
                {t("form.openExisting")}
              </Link>
            </>
          )}
        </p>
      )}
      <div className="col-span-full flex justify-end gap-2">
        <Button type="submit" disabled={busy || !access.ready}>
          {busy ? t("form.saving") : contact ? t("form.saveChanges") : t("form.createContact")}
        </Button>
      </div>
    </form>
  );
}
