"use client";

import { useRef, useState } from "react";
import type { Company } from "@/lib/types";
import { Field, LoadError } from "@/components/ui";
import {
  CustomFieldsInputs,
  useCustomFields,
} from "@/components/custom-fields";
import { stripBlockedWrites } from "@/lib/field-access";
import { useFieldAccess } from "@/hooks/use-field-access";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { OwnerField, ownerFromForm } from "@/components/owner-controls";
import { useT } from "@/lib/i18n/provider";

export function CompanyForm({
  company,
  onSaved,
}: {
  company?: Company;
  onSaved: () => void;
}) {
  const t = useT();
  const { defs, failed, retry } = useCustomFields("company");
  const access = useFieldAccess("companies");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>(
    company?.custom ?? {},
  );
  const submittingRef = useRef(false);

  /** `ownerId` only when the Owner choice changed. */
  const ownerPatch = (f: FormData) => {
    const owner = ownerFromForm(f, company?.ownerId ?? "");
    return owner !== undefined ? { ownerId: owner } : {};
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const f = new FormData(e.currentTarget);
      const val = (k: string) => (f.get(k) as string)?.trim() || null;
      const revenue = (f.get("annualRevenue") as string)?.trim();
      const body = {
        name: val("name") ?? "",
        domain: val("domain"),
        industry: val("industry"),
        size: val("size"),
        website: val("website"),
        linkedin: val("linkedin"),
        city: val("city"),
        country: val("country"),
        annualRevenue: revenue ? Number(revenue) : null,
        custom,
        ...ownerPatch(f),
      };
      const res = await fetch(
        company ? `/api/companies/${company.id}` : "/api/companies",
        {
          method: company ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(stripBlockedWrites(body, access.blockedWrites)),
        },
      );
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : t("form.failedSave"),
        );
        return;
      }
      onSaved();
    } catch {
      setError(t("form.failedSave"));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (access.failed) return <LoadError compact onRetry={access.retry} />;

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      aria-busy={busy}
    >
      {(!company || !access.hidden.has("name")) && (
        <Field label={t("field.name")} className="sm:col-span-2">
          <Input
            name="name"
            required={!company}
            disabled={!!company && access.blockedWrites.has("name")}
            defaultValue={company?.name}
          />
        </Field>
      )}
      {!access.hidden.has("domain") && (
        <Field label={t("field.domain")}>
          <Input
            name="domain"
            disabled={access.blockedWrites.has("domain")}
            defaultValue={company?.domain ?? ""}
            placeholder={t("field.domainPlaceholder")}
          />
        </Field>
      )}
      {!access.hidden.has("website") && (
        <Field label={t("field.website")}>
          <Input
            name="website"
            disabled={access.blockedWrites.has("website")}
            defaultValue={company?.website ?? ""}
            placeholder={t("field.websitePlaceholder")}
          />
        </Field>
      )}
      {!access.hidden.has("industry") && (
        <Field label={t("field.industry")}>
          <Input
            name="industry"
            disabled={access.blockedWrites.has("industry")}
            defaultValue={company?.industry ?? ""}
          />
        </Field>
      )}
      {!access.hidden.has("size") && (
        <Field label={t("field.size")}>
          <NativeSelect
            name="size"
            defaultValue={company?.size ?? ""}
            className="w-full"
            disabled={access.blockedWrites.has("size")}
          >
            <option value="">—</option>
            {["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("annualRevenue") && (
        <Field label={t("field.annualRevenueUsd")}>
          <Input
            name="annualRevenue"
            type="number"
            min={0}
            disabled={access.blockedWrites.has("annualRevenue")}
            defaultValue={company?.annualRevenue ?? ""}
          />
        </Field>
      )}
      {!access.hidden.has("linkedin") && (
        <Field label={t("field.linkedin")}>
          <Input
            name="linkedin"
            disabled={access.blockedWrites.has("linkedin")}
            defaultValue={company?.linkedin ?? ""}
          />
        </Field>
      )}
      {!access.hidden.has("city") && (
        <Field label={t("field.city")}>
          <Input
            name="city"
            disabled={access.blockedWrites.has("city")}
            defaultValue={company?.city ?? ""}
          />
        </Field>
      )}
      {!access.hidden.has("country") && (
        <Field label={t("field.country")}>
          <Input
            name="country"
            disabled={access.blockedWrites.has("country")}
            defaultValue={company?.country ?? ""}
          />
        </Field>
      )}
      {!access.hidden.has("ownerId") && (
        <OwnerField initialOwnerId={company?.ownerId ?? ""} isNew={!company} disabled={access.blockedWrites.has("ownerId")} />
      )}
      {!access.hidden.has("custom") && (
        <CustomFieldsInputs
          defs={defs}
          values={custom}
          onChange={setCustom}
          failed={failed}
          onRetry={retry}
        />
      )}
      {error && (
        <p role="alert" className="col-span-full text-sm text-feedback-error">
          {error}
        </p>
      )}
      <div className="col-span-full flex justify-end">
        <Button type="submit" disabled={busy || !access.ready}>
          {busy
            ? t("form.saving")
            : company
              ? t("form.saveChanges")
              : t("form.createCompany")}
        </Button>
      </div>
    </form>
  );
}
