import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { DEFAULT_REPORTING_RATES, SUPPORTED_CURRENCIES, type ReportingRates } from "@/lib/currency";
import { customFieldDefsOf } from "@/lib/custom-fields";

/**
 * Workspace reporting settings (CONTEXT.md: Reporting currency, Exchange rate,
 * Delivery date, Breakdown field), stored as one JSON value in `settings`.
 * A workspace that never saved them reports in USD at the built-in rates.
 */
export type ReportingSettings = ReportingRates & {
  /** Key of the deal custom date field that holds the Delivery date. */
  deliveryField: string | null;
  /** Key of the deal custom select field that splits forecasts into columns. */
  breakdownField: string | null;
};

const SETTINGS_KEY = "reporting";

export const DEFAULT_REPORTING: ReportingSettings = { ...DEFAULT_REPORTING_RATES, deliveryField: null, breakdownField: null };

export const reportingPatch = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  perUsd: z.record(z.enum(SUPPORTED_CURRENCIES), z.number().positive().finite()).optional(),
  deliveryField: z.string().min(1).nullable().optional(),
  breakdownField: z.string().min(1).nullable().optional(),
});

export async function loadReportingSettings(): Promise<ReportingSettings> {
  const row = (
    await db.select({ value: tables.settings.value }).from(tables.settings).where(eq(tables.settings.key, SETTINGS_KEY)).limit(1)
  )[0];
  if (!row) return DEFAULT_REPORTING;
  try {
    return { ...DEFAULT_REPORTING, ...(JSON.parse(row.value) as Partial<ReportingSettings>) };
  } catch {
    return DEFAULT_REPORTING;
  }
}

/**
 * Merge `patch` into the saved settings. Returns an error message when a
 * named field is not a deal custom field of the right type.
 */
export async function saveReportingSettings(
  patch: z.infer<typeof reportingPatch>,
): Promise<{ ok: true; settings: ReportingSettings } | { ok: false; error: string }> {
  const defs = await customFieldDefsOf("deal");
  const isField = (key: string, type: string) => defs.some((d) => d.key === key && d.type === type);
  if (patch.deliveryField && !isField(patch.deliveryField, "date")) {
    return { ok: false, error: "deliveryField: not a deal date field" };
  }
  if (patch.breakdownField && !isField(patch.breakdownField, "select")) {
    return { ok: false, error: "breakdownField: not a deal select field" };
  }

  const current = await loadReportingSettings();
  // perUsd replaces the saved overrides: a rate left out falls back to the built-in one.
  const settings: ReportingSettings = { ...current, ...patch, perUsd: patch.perUsd ?? current.perUsd };
  const value = JSON.stringify(settings);
  await db
    .insert(tables.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: [tables.settings.workspaceId, tables.settings.key], set: { value } });
  return { ok: true, settings };
}
