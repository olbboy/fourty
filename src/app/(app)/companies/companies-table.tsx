"use client";

import { useEffect, useRef } from "react";
import type { CompanyRead } from "@/lib/types";
import { formatCompact } from "@/lib/currency";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

type CompaniesTableProps = {
  companies: CompanyRead[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPreview: (id: string) => void;
};

function displayName(company: CompanyRead, fallback: string): string {
  return typeof company.name === "string" && company.name.trim() ? company.name : fallback;
}

function displayText(value: string | null | undefined): string {
  return typeof value === "string" && value.trim() ? value : "—";
}

export function CompaniesTable({
  companies,
  selectedIds,
  onToggle,
  onToggleAll,
  onPreview,
}: CompaniesTableProps) {
  const t = useT();
  const headerRef = useRef<HTMLInputElement>(null);
  const readableIds = companies.flatMap((company) => (typeof company.id === "string" && company.id ? [company.id] : []));
  const selectedOnPage = readableIds.filter((id) => selectedIds.has(id));
  const allSelected = readableIds.length > 0 && selectedOnPage.length === readableIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div>
      <p id="companies-table-scroll-hint" className="mb-2 text-xs text-ink-muted sm:hidden">
        {t("companies.tableScrollHint")}
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]" aria-describedby="companies-table-scroll-hint">
          <thead className="border-b border-line">
            <tr>
              <th className="th w-10">
                <input
                  ref={headerRef}
                  type="checkbox"
                  checked={allSelected}
                  disabled={readableIds.length === 0}
                  onChange={(event) => onToggleAll(event.target.checked)}
                  aria-label={t("companies.selectAll")}
                />
              </th>
              <th className="th">{t("companies.name")}</th>
              <th className="th">{t("companies.industry")}</th>
              <th className="th">{t("companies.size")}</th>
              <th className="th hidden lg:table-cell">{t("companies.location")}</th>
              <th className="th text-right">{t("companies.revenue")}</th>
              <th className="th">{t("companies.updated")}</th>
              <th className="th">{t("companies.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company, index) => {
              const id = typeof company.id === "string" && company.id ? company.id : null;
              const name = displayName(company, t("companies.unknownName"));
              const isSelected = id ? selectedIds.has(id) : false;
              const revenue = typeof company.annualRevenue === "number" ? formatCompact(company.annualRevenue, "USD") : "—";
              const updated = typeof company.updatedAt === "number" ? timeAgo(company.updatedAt) : "—";
              return (
                <tr
                  key={id ?? `company-row-${index}`}
                  data-company-id={id ?? undefined}
                  data-selected={isSelected ? "true" : undefined}
                  className={`border-b border-line/60 transition last:border-0 ${
                    isSelected ? "bg-accent-500/10 hover:bg-accent-500/15" : "hover:bg-surface-2"
                  }`}
                >
                  <td className="td">
                    {id ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => onToggle(id, event.target.checked)}
                        aria-label={t("companies.selectCompany", { name })}
                      />
                    ) : null}
                  </td>
                  <td className="td font-medium">
                    {id ? (
                      <a href={`/companies/${encodeURIComponent(id)}`} className="underline-offset-2 hover:underline">
                        {name}
                      </a>
                    ) : (
                      name
                    )}
                    {typeof company.domain === "string" && company.domain.trim() ? (
                      <span className="block text-xs font-normal text-ink-muted">{company.domain}</span>
                    ) : null}
                  </td>
                  <td className="td text-ink-muted">{displayText(company.industry)}</td>
                  <td className="td text-ink-muted">{displayText(company.size)}</td>
                  <td className="td hidden text-ink-muted lg:table-cell">
                    {[company.city, company.country].filter((value): value is string => Boolean(value?.trim())).join(", ") || "—"}
                  </td>
                  <td className="td text-right tabular-nums text-ink-muted">{revenue}</td>
                  <td className="td text-ink-muted">{updated}</td>
                  <td className="td">
                    {id ? (
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1 text-xs"
                        aria-label={`${t("companies.preview")} ${name}`}
                        data-preview-trigger-id={id}
                        onClick={() => onPreview(id)}
                      >
                        {t("companies.preview")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
