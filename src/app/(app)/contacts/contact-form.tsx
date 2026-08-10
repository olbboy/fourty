"use client";

import { useState } from "react";
import type { Contact, Company } from "@/lib/types";
import { Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";

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
        <Input name="firstName" required defaultValue={contact?.firstName} />
      </Field>
      <Field label="Last name">
        <Input name="lastName" defaultValue={contact?.lastName} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={contact?.email ?? ""} />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={contact?.phone ?? ""} />
      </Field>
      <Field label="Job title">
        <Input name="jobTitle" defaultValue={contact?.jobTitle ?? ""} />
      </Field>
      <Field label="Company">
        <NativeSelect name="companyId" defaultValue={contact?.companyId ?? ""} className="w-full">
          <option value="">—</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Status">
        <NativeSelect name="status" defaultValue={contact?.status ?? "lead"} className="w-full">
          <option value="lead">Lead</option>
          <option value="qualified">Qualified</option>
          <option value="customer">Customer</option>
          <option value="churned">Churned</option>
        </NativeSelect>
      </Field>
      <Field label="Source">
        <NativeSelect name="source" defaultValue={contact?.source ?? ""} className="w-full">
          <option value="">—</option>
          <option value="website">Website</option>
          <option value="referral">Referral</option>
          <option value="outbound">Outbound</option>
          <option value="event">Event</option>
          <option value="other">Other</option>
        </NativeSelect>
      </Field>
      <Field label="LinkedIn">
        <Input name="linkedin" defaultValue={contact?.linkedin ?? ""} />
      </Field>
      <Field label="City">
        <Input name="city" defaultValue={contact?.city ?? ""} />
      </Field>
      <Field label="Country">
        <Input name="country" defaultValue={contact?.country ?? ""} />
      </Field>
      <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} />
      {error && <p className="col-span-full text-sm text-feedback-error">{error}</p>}
      <div className="col-span-full flex justify-end gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : contact ? "Save changes" : "Create contact"}
        </Button>
      </div>
    </form>
  );
}
