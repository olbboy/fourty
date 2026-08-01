"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n/provider";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@/lib/i18n";

// Interface language (Gate C4). Persists to a cookie via /api/locale, then
// refreshes so the server layout re-resolves the locale.
export function LanguageSection() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    setSaving(true);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">{t("settings.language")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.languageHint")}</p>
      <label htmlFor="locale-select" className="sr-only">
        {t("settings.language")}
      </label>
      <select
        id="locale-select"
        value={locale}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="input w-auto"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  );
}

