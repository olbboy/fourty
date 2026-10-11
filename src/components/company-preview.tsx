"use client";

import { Drawer, Spinner } from "@/components/ui";
import { formatCompact } from "@/lib/currency";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { CompanyRead } from "@/lib/types";
import { useEffect, useState, type ReactNode } from "react";

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

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function PreviewField({ label, value, tabular = false }: { label: string; value: ReactNode; tabular?: boolean }) {
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
  const name = company ? textValue(company.name) : null;
  const readableId = company && typeof company.id === "string" && company.id ? company.id : null;
  const domain = company ? textValue(company.domain) : null;
  const website = company ? textValue(company.website) : null;
  const industry = company ? textValue(company.industry) : null;
  const size = company ? textValue(company.size) : null;
  const location = company
    ? [company.city, company.country]
        .map(textValue)
        .filter((value): value is string => Boolean(value))
        .join(", ")
    : null;
  const hasIdentity = Boolean(name || domain || website);
  const hasBusinessFacts = Boolean(industry || size || typeof company?.annualRevenue === "number");
  const hasLocationFacts = Boolean(location || typeof company?.updatedAt === "number");

  return (
    <Drawer title={t("companies.previewTitle")} open={Boolean(id)} onClose={onClose}>
      {activeState?.status === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
          <Spinner label={t("companies.previewLoading")} />
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

      {company && (hasIdentity || hasBusinessFacts || hasLocationFacts) && (
        <div className="space-y-6">
          {name ? <h3 className="text-lg font-semibold">{name}</h3> : null}
          {hasIdentity ? (
            <section aria-labelledby="company-preview-identity-heading" className="space-y-3">
              <h3 id="company-preview-identity-heading" className="text-sm font-semibold">
                {t("companies.previewIdentity")}
              </h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                {name ? <PreviewField label={t("companies.name")} value={name} /> : null}
                {domain ? <PreviewField label={t("companies.domain")} value={domain} /> : null}
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
            </section>
          ) : null}

          {hasBusinessFacts ? (
            <section aria-labelledby="company-preview-business-heading" className="space-y-3">
              <h3 id="company-preview-business-heading" className="text-sm font-semibold">
                {t("companies.previewBusiness")}
              </h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                {industry ? <PreviewField label={t("companies.industry")} value={industry} /> : null}
                {size ? <PreviewField label={t("companies.size")} value={size} /> : null}
                {typeof company.annualRevenue === "number" ? (
                  <PreviewField
                    label={t("companies.revenue")}
                    value={formatCompact(company.annualRevenue, "USD")}
                    tabular
                  />
                ) : null}
              </dl>
            </section>
          ) : null}

          {hasLocationFacts ? (
            <section aria-labelledby="company-preview-location-heading" className="space-y-3">
              <h3 id="company-preview-location-heading" className="text-sm font-semibold">
                {t("companies.previewLocation")}
              </h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                {location ? <PreviewField label={t("companies.location")} value={location} /> : null}
                {typeof company.updatedAt === "number" ? (
                  <PreviewField label={t("companies.updated")} value={timeAgo(company.updatedAt)} />
                ) : null}
              </dl>
            </section>
          ) : null}

        </div>
      )}

      {company && readableId ? (
        <a href={`/companies/${encodeURIComponent(readableId)}`} className="btn-primary mt-6 inline-flex">
          {t("companies.viewFullDetails")}
        </a>
      ) : null}
    </Drawer>
  );
}
