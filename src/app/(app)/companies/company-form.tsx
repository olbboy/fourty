"use client";

import { useState } from "react";
import type { Company } from "@/lib/types";
import { Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";

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
        <input name="name" required defaultValue={company?.name} className="input" />
      </Field>
      <Field label="Domain">
        <input name="domain" defaultValue={company?.domain ?? ""} className="input" placeholder="acme.com" />
      </Field>
      <Field label="Website">
        <input name="website" defaultValue={company?.website ?? ""} className="input" placeholder="https://…" />
      </Field>
      <Field label="Industry">
        <input name="industry" defaultValue={company?.industry ?? ""} className="input" />
      </Field>
      <Field label="Size">
        <select name="size" defaultValue={company?.size ?? ""} className="input">
          <option value="">—</option>
          {["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Annual revenue (USD)">
        <input name="annualRevenue" type="number" min={0} defaultValue={company?.annualRevenue ?? ""} className="input" />
      </Field>
      <Field label="LinkedIn">
        <input name="linkedin" defaultValue={company?.linkedin ?? ""} className="input" />
      </Field>
      <Field label="City">
        <input name="city" defaultValue={company?.city ?? ""} className="input" />
      </Field>
      <Field label="Country">
        <input name="country" defaultValue={company?.country ?? ""} className="input" />
      </Field>
      <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} />
      {error && <p className="col-span-full text-sm text-red-500">{error}</p>}
      <div className="col-span-full flex justify-end">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : company ? "Save changes" : "Create company"}
        </button>
      </div>
    </form>
  );
}
