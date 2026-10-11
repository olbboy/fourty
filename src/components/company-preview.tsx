"use client";

import { Drawer, Spinner } from "@/components/ui";
import { formatCompact } from "@/lib/currency";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { CompanyRead } from "@/lib/types";
import { useEffect, useState } from "react";

type PreviewState =
  | { id: string; status: "loading" }
  | { id: string; status: "ready"; company: CompanyRead }
  | { id: string; status: "not-found" }
  | { id: string; status: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(body: unknown): string {
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return "Request failed";
}

function companyFromResponse(body: unknown): CompanyRead | null {
  if (!isRecord(body) || !isRecord(body.company)) return null;
  return body.company as CompanyRead;
}

function displayName(company: CompanyRead, fallback: string): string {
  return typeof company.name === "string" && company.name.trim() ? company.name : fallback;
}

function displayText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "—";
}

function PreviewField({ label, value, tabular = false }: { label: string; value: React.ReactNode; tabular?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${tabular ? "tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}

export function CompanyPreview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!id) {
      setState(null);
      return;
    }

    const controller = new AbortController();
    setState({ id, status: "loading" });
    fetch(`/api/companies/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => ({}));
        if (response.status === 404) return { status: "not-found" as const };
        if (!response.ok) throw new Error(errorMessage(body));
        const company = companyFromResponse(body);
        if (!company) throw new Error("Invalid company response");
        return { status: "ready" as const, company };
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "ready") setState({ id, status: "ready", company: result.company });
        else setState({ id, status: "not-found" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({ id, status: "error", message: reason instanceof Error ? reason.message : "Request failed" });
      });

    return () => controller.abort();
  }, [id, retryVersion]);

  const activeState = state?.id === id ? state : id ? { id, status: "loading" as const } : null;
  const company = activeState?.status === "ready" ? activeState.company : null;
  const name = company ? displayName(company, t("companies.unknownName")) : null;
  const readableId = company && typeof company.id === "string" && company.id ? company.id : null;
  const website = company && typeof company.website === "string" ? company.website.trim() : "";
  const location = company
    ? [company.city, company.country]
        .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
        .join(", ")
    : "";

  return (
    <Drawer title={t("companies.previewTitle")} open={Boolean(id)} onClose={onClose}>
      {activeState?.status === "loading" && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 py-8 text-sm text-ink-muted">
          <Spinner />
          <span>{t("companies.previewLoading")}</span>
        </div>
      )}

      {activeState?.status === "not-found" && (
        <div role="alert" className="space-y-2 py-6 text-sm">
          <p className="font-medium">{t("companies.previewNotFound")}</p>
          <p className="text-ink-muted">{t("companies.previewNotFoundHint")}</p>
        </div>
      )}

      {activeState?.status === "error" && (
        <div role="alert" className="space-y-3 py-6 text-sm">
          <p className="font-medium">{t("companies.previewError")}</p>
          <p className="text-ink-muted">{t("companies.previewErrorHint")}</p>
          <button type="button" className="btn-ghost" onClick={() => setRetryVersion((value) => value + 1)}>
            {t("companies.retry")}
          </button>
        </div>
      )}

      {company && name && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">{name}</h3>
            {typeof company.domain === "string" && company.domain.trim() ? (
              <p className="mt-1 text-sm text-ink-muted">{company.domain}</p>
            ) : null}
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <PreviewField label={t("companies.industry")} value={displayText(company.industry)} />
            <PreviewField label={t("companies.size")} value={displayText(company.size)} />
            <PreviewField label={t("companies.location")} value={location || "—"} />
            <PreviewField
              label={t("companies.revenue")}
              value={typeof company.annualRevenue === "number" ? formatCompact(company.annualRevenue, "USD") : "—"}
              tabular
            />
            <PreviewField
              label={t("companies.updated")}
              value={typeof company.updatedAt === "number" ? timeAgo(company.updatedAt) : "—"}
            />
            {website ? (
              <PreviewField
                label={t("companies.website")}
                value={/^https?:\/\//i.test(website) ? (
                  <a href={website} className="text-accent-600 underline underline-offset-2" target="_blank" rel="noreferrer">
                    {website}
                  </a>
                ) : (
                  website
                )}
              />
            ) : null}
          </dl>

          {readableId ? (
            <a href={`/companies/${encodeURIComponent(readableId)}`} className="btn-primary inline-flex">
              {t("companies.viewFullDetails")}
            </a>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
