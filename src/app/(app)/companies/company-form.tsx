"use client";

import { useRef, useState } from "react";
import type { Company } from "@/lib/types";
import { Button, Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { Select } from "@/components/select";

export function CompanyForm({ company, onSaved }: { company?: Company; onSaved: () => void }) {
  const defs = useCustomFields("company");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>(company?.custom ?? {});
  const submittingRef = useRef(false);

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
      };
      const res = await fetch(company ? `/api/companies/${company.id}` : "/api/companies", {
        method: company ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to save. Please try again.",
        );
        return;
      }
      onSaved();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name" required className="sm:col-span-2">
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
        <Select
          name="size"
          defaultValue={company?.size ?? ""}
          className="input"
          options={[
            { value: "", label: "—" },
            ...["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"].map((s) => ({
              value: s,
              label: s,
            })),
          ]}
        />
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
      {error && <p role="alert" className="col-span-full text-sm text-danger">{error}</p>}
      <div className="col-span-full flex justify-end">
        <Button type="submit" busy={busy}>
          {busy ? "Saving…" : company ? "Save changes" : "Create company"}
        </Button>
      </div>
    </form>
  );
}
