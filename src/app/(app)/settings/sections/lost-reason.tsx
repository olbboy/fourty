"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/lib/i18n/provider";

type ChoiceField = { key: string; label: string };

/**
 * Which deal choice field a deal must fill before it closes as lost (Q75, Q85).
 * Sits under the pipelines because the rule fires when a deal enters a lost
 * stage; the value is stored with the other "pick a deal field" settings.
 */
export function LostReasonSection() {
  const t = useT();
  const [fields, setFields] = useState<ChoiceField[] | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/custom-fields?entity=deal", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/reporting", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([defs, settings]) => {
        const list = Array.isArray(defs?.fields) ? (defs.fields as { key: string; label: string; type: string }[]) : [];
        setFields(list.filter((f) => f.type === "select").map(({ key, label }) => ({ key, label })));
        setValue(typeof settings?.lostReasonField === "string" ? settings.lostReasonField : "");
      })
      .catch(() => setFields([]));
    return () => controller.abort();
  }, []);

  async function save(next: string) {
    setValue(next);
    setStatus("idle");
    const res = await fetch("/api/settings/reporting", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lostReasonField: next || null }),
    }).catch(() => null);
    setStatus(res?.ok ? "saved" : "failed");
  }

  if (!fields) return null;
  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("settings.lostReason")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.lostReasonHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={value} onChange={(e) => void save(e.target.value)} aria-label={t("settings.lostReason")}>
          <option value="">{t("settings.lostReasonNone")}</option>
          {fields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </NativeSelect>
        {status === "saved" && <span className="text-xs text-feedback-ok">{t("settings.reportingSaved")}</span>}
        {status === "failed" && (
          <span role="alert" className="text-xs text-feedback-error">
            {t("settings.lostReasonFailed")}
          </span>
        )}
      </div>
    </Card>
  );
}
