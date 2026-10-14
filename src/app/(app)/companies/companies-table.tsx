"use client";

import Link from "next/link";
import type { CompanyRead } from "@/lib/types";
import { formatCompact } from "@/lib/currency";
import { timeAgo } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CompaniesTableProps = {
  companies: CompanyRead[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPreview: (id: string) => void;
  /** The Owner's display name, "Unassigned", "Name (left)", or "—" when hidden. */
  ownerName: (company: CompanyRead) => string;
};

function displayName(company: CompanyRead, fallback: string): string {
  return typeof company.name === "string" && company.name.trim()
    ? company.name
    : fallback;
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
  ownerName,
}: CompaniesTableProps) {
  const t = useT();
  const locale = useLocale();
  const readableIds = companies.flatMap((company) =>
    typeof company.id === "string" && company.id ? [company.id] : [],
  );
  const selectedOnPage = readableIds.filter((id) => selectedIds.has(id));
  const allSelected =
    readableIds.length > 0 && selectedOnPage.length === readableIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  return (
    <div>
      <p
        id="companies-table-scroll-hint"
        className="mb-2 text-xs text-ink-muted sm:hidden"
      >
        {t("companies.tableScrollHint")}
      </p>
      <Card size="flush">
        <Table
          className="min-w-[760px]"
          aria-describedby="companies-table-scroll-hint"
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={readableIds.length === 0}
                  onCheckedChange={onToggleAll}
                  aria-label={t("companies.selectAll")}
                />
              </TableHead>
              <TableHead>{t("companies.name")}</TableHead>
              <TableHead>{t("companies.industry")}</TableHead>
              <TableHead>{t("companies.size")}</TableHead>
              <TableHead>{t("field.owner")}</TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("companies.location")}
              </TableHead>
              <TableHead className="text-right">
                {t("companies.revenue")}
              </TableHead>
              <TableHead>{t("companies.updated")}</TableHead>
              <TableHead>{t("companies.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company, index) => {
              const id =
                typeof company.id === "string" && company.id
                  ? company.id
                  : null;
              const name = displayName(company, t("companies.unknownName"));
              const isSelected = id ? selectedIds.has(id) : false;
              const revenue =
                typeof company.annualRevenue === "number"
                  ? formatCompact(company.annualRevenue, "USD", locale)
                  : "—";
              const updated =
                typeof company.updatedAt === "number"
                  ? timeAgo(company.updatedAt)
                  : "—";
              return (
                <TableRow
                  key={id ?? `company-row-${index}`}
                  data-company-id={id ?? undefined}
                  data-selected={isSelected ? "true" : undefined}
                  className={
                    isSelected
                      ? "bg-accent-500/10 hover:bg-accent-500/15"
                      : "hover:bg-surface-2"
                  }
                >
                  <TableCell>
                    {id ? (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onToggle(id, checked)}
                        aria-label={t("companies.selectCompany", { name })}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">
                    {id ? (
                      <Link
                        href={`/companies/${encodeURIComponent(id)}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                    {typeof company.domain === "string" &&
                    company.domain.trim() ? (
                      <span className="block text-xs font-normal text-ink-muted">
                        {company.domain}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {displayText(company.industry)}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {displayText(company.size)}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {ownerName(company)}
                  </TableCell>
                  <TableCell className="hidden text-ink-muted lg:table-cell">
                    {[company.city, company.country]
                      .filter((value): value is string =>
                        Boolean(value?.trim()),
                      )
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right text-ink-muted">
                    {revenue}
                  </TableCell>
                  <TableCell className="text-ink-muted">{updated}</TableCell>
                  <TableCell>
                    {id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label={`${t("companies.preview")} ${name}`}
                        data-preview-trigger-id={id}
                        onClick={() => onPreview(id)}
                      >
                        {t("companies.preview")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
