"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/lib/i18n/provider";

type Person = { id: string; name: string };

/**
 * The Default lead owner (Q107): who receives a contact another system sends
 * over the API without naming an owner, and with it the follow-up task.
 */
export function LeadsSection() {
  const t = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/tasks/assignees", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/leads", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([list, settings]) => {
        setPeople(Array.isArray(list?.assignees) ? (list.assignees as Person[]) : []);
        setValue(typeof settings?.defaultOwnerId === "string" ? settings.defaultOwnerId : "");
      })
      .catch(() => setPeople([]));
    return () => controller.abort();
  }, []);

  async function save(next: string) {
    setValue(next);
    setStatus("idle");
    const res = await fetch("/api/settings/leads", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultOwnerId: next || null }),
    }).catch(() => null);
    setStatus(res?.ok ? "saved" : "failed");
  }

  if (!people) return null;
  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("settings.leadOwner")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.leadOwnerHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={value} onChange={(e) => void save(e.target.value)} aria-label={t("settings.leadOwner")}>
          <option value="">{t("settings.leadOwnerNone")}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
        {status === "saved" && <span className="text-xs text-feedback-ok">{t("settings.reportingSaved")}</span>}
        {status === "failed" && (
          <span role="alert" className="text-xs text-feedback-error">
            {t("settings.leadOwnerFailed")}
          </span>
        )}
      </div>
    </Card>
  );
}
