"use client";

import { useCallback, useEffect, useState } from "react";
import { Field, LoadError, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_RATES_TO_USD, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useT } from "@/lib/i18n/provider";

type Settings = {
  currency: string;
  perUsd: Record<string, number>;
  deliveryField: string | null;
  breakdownField: string | null;
};
type FieldDef = { key: string; label: string; type: string };

const RATED = SUPPORTED_CURRENCIES.filter((code) => code !== "USD");

/** Built-in rate written the way people quote it: units per 1 USD. */
function builtInPerUsd(code: string): string {
  const toUsd = DEFAULT_RATES_TO_USD[code];
  return toUsd ? String(Math.round((1 / toUsd) * 100) / 100) : "";
}

// Shown to admins only; GET is open to members because every page formats
// totals with it, PATCH is admin-only on the server either way.
export function ReportingSection() {
  const t = useT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [settingsRes, fieldsRes] = await Promise.all([
        fetch("/api/settings/reporting"),
        fetch("/api/custom-fields?entity=deal"),
      ]);
      if (!settingsRes.ok || !fieldsRes.ok) throw new Error("reporting");
      const loaded = (await settingsRes.json()) as Settings;
      setSettings(loaded);
      setFields(((await fieldsRes.json()) as { fields: FieldDef[] }).fields);
      setRates(Object.fromEntries(Object.entries(loaded.perUsd).map(([code, units]) => [code, String(units)])));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pick = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value ? value : null;
    };
    const perUsd: Record<string, number> = {};
    for (const [code, raw] of Object.entries(rates)) {
      const units = Number(raw);
      if (raw.trim() && Number.isFinite(units) && units > 0) perUsd[code] = units;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/reporting", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currency: pick("currency") ?? "USD",
        perUsd,
        deliveryField: pick("deliveryField"),
        breakdownField: pick("breakdownField"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setSettings((await res.json()) as Settings);
      setMessage({ ok: true, text: t("settings.reportingSaved") });
    } else {
      setMessage({ ok: false, text: t("settings.reportingFailed") });
    }
  }

  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("settings.reporting")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.reportingHint")}</p>
      {failed ? (
        <LoadError onRetry={() => void load()} />
      ) : !settings ? (
        <Spinner />
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t("settings.reportingCurrency")}>
              <NativeSelect name="currency" defaultValue={settings.currency} className="w-full">
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("settings.deliveryField")}>
              <NativeSelect name="deliveryField" defaultValue={settings.deliveryField ?? ""} className="w-full">
                <option value="">{t("settings.noneOption")}</option>
                {fields
                  .filter((f) => f.type === "date")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label={t("settings.breakdownField")}>
              <NativeSelect name="breakdownField" defaultValue={settings.breakdownField ?? ""} className="w-full">
                <option value="">{t("settings.noneOption")}</option>
                {fields
                  .filter((f) => f.type === "select")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </div>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("settings.exchangeRates")}
            </legend>
            <p className="mb-2 text-xs text-ink-muted">{t("settings.exchangeRatesHint")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATED.map((code) => (
                <label key={code} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0 font-medium">{code}</span>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    aria-label={`1 USD = … ${code}`}
                    placeholder={builtInPerUsd(code)}
                    value={rates[code] ?? ""}
                    onChange={(event) => setRates((prev) => ({ ...prev, [code]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-end gap-3">
            {message && (
              <p role="status" className={message.ok ? "text-sm text-ink-muted" : "text-sm text-feedback-error"}>
                {message.text}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? t("form.saving") : t("form.saveChanges")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
