"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Contact } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { displayName } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

type Person = { contactId: string; role: string | null; name: string; primary: boolean };

/**
 * The other people on a deal (D4, CONTEXT.md: Deal contact), each with the role
 * they play. The primary contact is set in the deal form and shown above; this
 * panel lists, adds and removes the rest, saving the whole list each time.
 */
export function DealContactsPanel({ dealId, contacts, onChanged }: { dealId: string; contacts: Contact[]; onChanged?: () => void }) {
  const t = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [pick, setPick] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals/${dealId}/contacts`).catch(() => null);
    if (res?.ok) setPeople(((await res.json()) as { contacts: Person[] }).contacts);
  }, [dealId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: { contactId: string; role: string | null }[]) {
    setError(null);
    const res = await fetch(`/api/deals/${dealId}/contacts`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contacts: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(t("dealContacts.failed"));
      return;
    }
    setPeople(((await res.json()) as { contacts: Person[] }).contacts);
    onChanged?.();
  }

  if (!people) return null;
  const others = people.filter((p) => !p.primary);
  const taken = new Set(people.map((p) => p.contactId));
  const choices = contacts.filter((c) => !taken.has(c.id));
  const current = others.map(({ contactId, role }) => ({ contactId, role }));

  return (
    <div className="space-y-2">
      {others.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("dealContacts.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {others.map((p) => (
            <li key={p.contactId} className="flex items-center gap-2 text-sm">
              <Link href={`/contacts/${p.contactId}`} className="min-w-0 flex-1 truncate text-accent-700 hover:underline dark:text-accent-400">
                {p.name}
              </Link>
              {p.role && <span className="shrink-0 text-xs text-ink-muted">{p.role}</span>}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("dealContacts.removeAria", { name: p.name })}
                onClick={() => void save(current.filter((c) => c.contactId !== p.contactId))}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pick) return;
          void save([...current, { contactId: pick, role: role.trim() || null }]).then(() => {
            setPick("");
            setRole("");
          });
        }}
      >
        <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t("dealContacts.pickAria")} size="sm" className="min-w-0 flex-1">
          <option value="">{t("dealContacts.pick")}</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {displayName(c.firstName, c.lastName)}
            </option>
          ))}
        </NativeSelect>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label={t("dealContacts.roleAria")}
          placeholder={t("dealContacts.rolePlaceholder")}
          maxLength={80}
          className="h-8 w-32"
        />
        {/* Named apart from the notes panel's own Add on the same page. */}
        <Button type="submit" size="sm" disabled={!pick} aria-label={t("dealContacts.addAria")}>
          {t("dealContacts.add")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-feedback-error">
          {error}
        </p>
      )}
    </div>
  );
}
