"use client";

import { useState } from "react";
import type { Contact, Company } from "@/lib/types";
import { Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { Select } from "@/components/select";

export function ContactForm({
  contact,
  companies,
  onSaved,
}: {
  contact?: Contact;
  companies: Company[];
  onSaved: () => void;
}) {
  const defs = useCustomFields("contact");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const res = await fetch(contact ? `/api/contacts/${contact.id}` : "/api/contacts", {
      method: contact ? "PATCH" : "POST",
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
      <Field label="First name">
        <input name="firstName" required defaultValue={contact?.firstName} className="input" />
      </Field>
      <Field label="Last name">
        <input name="lastName" defaultValue={contact?.lastName} className="input" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={contact?.email ?? ""} className="input" />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={contact?.phone ?? ""} className="input" />
      </Field>
      <Field label="Job title">
        <input name="jobTitle" defaultValue={contact?.jobTitle ?? ""} className="input" />
      </Field>
      <Field label="Company">
        <Select
          name="companyId"
          defaultValue={contact?.companyId ?? ""}
          className="input"
          options={[
            { value: "", label: "—" },
            ...companies.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      <Field label="Status">
        <Select
          name="status"
          defaultValue={contact?.status ?? "lead"}
          className="input"
          options={[
            { value: "lead", label: "Lead" },
            { value: "qualified", label: "Qualified" },
            { value: "customer", label: "Customer" },
            { value: "churned", label: "Churned" },
          ]}
        />
      </Field>
      <Field label="Source">
        <Select
          name="source"
          defaultValue={contact?.source ?? ""}
          className="input"
          options={[
            { value: "", label: "—" },
            { value: "website", label: "Website" },
            { value: "referral", label: "Referral" },
            { value: "outbound", label: "Outbound" },
            { value: "event", label: "Event" },
            { value: "other", label: "Other" },
          ]}
        />
      </Field>
      <Field label="LinkedIn">
        <input name="linkedin" defaultValue={contact?.linkedin ?? ""} className="input" />
      </Field>
      <Field label="City">
        <input name="city" defaultValue={contact?.city ?? ""} className="input" />
      </Field>
      <Field label="Country">
        <input name="country" defaultValue={contact?.country ?? ""} className="input" />
      </Field>
      <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} />
      {error && <p className="col-span-full text-sm text-red-500">{error}</p>}
      <div className="col-span-full flex justify-end gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : contact ? "Save changes" : "Create contact"}
        </button>
      </div>
    </form>
  );
}
