"use client";

import { useState } from "react";
import type { Company } from "@/lib/types";
import { Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";

export function CompanyForm({ company, onSaved }: { company?: Company; onSaved: () => void }) {
  const defs = useCustomFields("company");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>(company?.custom ?? {});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
    };
    const res = await fetch(company ? `/api/companies/${company.id}` : "/api/companies", {
      method: company ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onSaved();
    else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <Input name="name" required defaultValue={company?.name} />
      </Field>
      <Field label="Domain">
        <Input name="domain" defaultValue={company?.domain ?? ""} placeholder="acme.com" />
      </Field>
      <Field label="Website">
        <Input name="website" defaultValue={company?.website ?? ""} placeholder="https://…" />
      </Field>
      <Field label="Industry">
        <Input name="industry" defaultValue={company?.industry ?? ""} />
      </Field>
      <Field label="Size">
        <NativeSelect name="size" defaultValue={company?.size ?? ""} className="w-full">
          <option value="">—</option>
          {["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Annual revenue (USD)">
        <Input name="annualRevenue" type="number" min={0} defaultValue={company?.annualRevenue ?? ""} />
      </Field>
      <Field label="LinkedIn">
        <Input name="linkedin" defaultValue={company?.linkedin ?? ""} />
      </Field>
      <Field label="City">
        <Input name="city" defaultValue={company?.city ?? ""} />
      </Field>
      <Field label="Country">
        <Input name="country" defaultValue={company?.country ?? ""} />
      </Field>
      <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} />
      {error && <p className="col-span-full text-sm text-feedback-error">{error}</p>}
      <div className="col-span-full flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : company ? "Save changes" : "Create company"}
        </Button>
      </div>
    </form>
  );
}
