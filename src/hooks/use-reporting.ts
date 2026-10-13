"use client";

import { useEffect, useState } from "react";
import type { ReportingRates } from "@/lib/currency";

export type ReportingState = { ready: boolean; rates: ReportingRates };

/**
 * The workspace's Reporting currency and Exchange rates, for totals the
 * browser adds up itself (board columns, the deal page). Until they load,
 * `ready` is false and callers show no total rather than a USD one that then
 * jumps to another currency.
 */
export function useReporting(): ReportingState {
  const [state, setState] = useState<ReportingState>({ ready: false, rates: { currency: "USD", perUsd: {} } });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings/reporting", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as { currency?: unknown; perUsd?: unknown };
      })
      .then((data) => {
        if (typeof data.currency !== "string") return;
        const perUsd = data.perUsd && typeof data.perUsd === "object" ? (data.perUsd as Record<string, number>) : {};
        setState({ ready: true, rates: { currency: data.currency, perUsd } });
      })
      .catch(() => {
        // Leave totals blank: a guessed currency would be a wrong number, not a missing one.
      });
    return () => controller.abort();
  }, []);

  return state;
}
