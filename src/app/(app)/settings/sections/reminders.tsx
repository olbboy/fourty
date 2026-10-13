"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useLocale, useT } from "@/lib/i18n/provider";

type Settings = { enabled: boolean; timeZone: string; locale: "en" | "vi"; appUrl: string | null };

/**
 * The morning task reminder (Q78): one switch for the workspace, its time
 * zone, and the language of the email. Sent at 8:00 there to each owner with
 * tasks due today or overdue, when outbound mail is set up.
 */
export function RemindersSection() {
  const t = useT();
  const uiLocale = useLocale();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings/reminders", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Settings | null) => data && setSettings(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Show the change at once; put it back if the server refuses it.
  async function save(patch: Partial<Settings>) {
    const previous = settings;
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setStatus("idle");
    const res = await fetch("/api/settings/reminders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      setSettings(previous);
      setStatus("failed");
      return;
    }
    setSettings((await res.json()) as Settings);
    setStatus("saved");
  }

  if (!settings) return null;
  const options = zones.includes(settings.timeZone) ? zones : [settings.timeZone, ...zones];
  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("settings.reminders")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.remindersHint")}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            // Turning it on for the first time writes the email in the admin's language.
            onChange={(e) =>
              void save(e.target.checked && !settings.enabled ? { enabled: true, locale: uiLocale } : { enabled: e.target.checked })
            }
            className="h-4 w-4 accent-indigo-600"
          />
          {t("settings.remindersOn")}
        </label>
        <NativeSelect
          value={settings.timeZone}
          onChange={(e) => void save({ timeZone: e.target.value })}
          aria-label={t("settings.remindersZone")}
          size="sm"
        >
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={settings.locale}
          onChange={(e) => void save({ locale: e.target.value as Settings["locale"] })}
          aria-label={t("settings.remindersLanguage")}
          size="sm"
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </NativeSelect>
        {status === "saved" && <span className="text-xs text-feedback-ok">{t("settings.reportingSaved")}</span>}
        {status === "failed" && (
          <span role="alert" className="text-xs text-feedback-error">
            {t("settings.remindersFailed")}
          </span>
        )}
      </div>
    </Card>
  );
}
