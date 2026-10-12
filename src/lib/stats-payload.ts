function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A `/api/stats/dashboard` body the dashboard can render. Error envelopes
 * (`{ error }`) and partial JSON fail this, so the page can retry instead of
 * throwing on `kpis.pipelineValue`.
 */
export function isDashboardStatsPayload(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.kpis)) return false;
  return (
    Array.isArray(data.funnel) &&
    Array.isArray(data.revenueByMonth) &&
    Array.isArray(data.activityByWeek) &&
    Array.isArray(data.hotLeads) &&
    Array.isArray(data.dueTasks) &&
    Array.isArray(data.staleDeals)
  );
}

/** A `/api/stats/reports` body the reports page can map over. */
export function isReportStatsPayload(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return (
    Array.isArray(data.sourceBreakdown) &&
    Array.isArray(data.winLoss) &&
    Array.isArray(data.aging) &&
    Array.isArray(data.scoreBands) &&
    Array.isArray(data.statusBreakdown)
  );
}
