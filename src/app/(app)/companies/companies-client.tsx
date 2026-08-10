"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { formatCompact } from "@/lib/currency";
import { PageHeader, Modal, EmptyState, Spinner } from "@/components/ui";
import { IconPlus, IconDownload } from "@/components/icons";
import { CompanyForm } from "./company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CompaniesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await fetch(`/api/companies?${params}`);
    if (res.ok) setCompanies((await res.json()).companies);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 150 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Companies"
        subtitle={companies ? `${companies.length} organizations` : undefined}
        actions={
          <>
            <Button variant="outline" render={<a href="/api/export/companies" />}>
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">New company</span>
              <span className="sm:hidden">New</span>
            </Button>
          </>
        }
      />

      <div className="mb-4">
        {/* No visible label above the box, and a placeholder is a fallback name
            at best — say what it searches. */}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search companies"
          placeholder="Search name, domain, industry…" className="max-w-xs" />
      </div>

      {!companies ? (
        <Spinner />
      ) : companies.length === 0 ? (
        <EmptyState
          title="No companies yet"
          hint="Companies group your contacts and deals by organization."
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} /> New company
            </Button>
          }
        />
      ) : (
        <Card size="flush">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => router.push(`/companies/${c.id}`)}
                  className="cursor-pointer transition hover:bg-surface-2"
                >
                  <TableCell className="font-medium">
                    {c.name}
                    {c.domain && (
                      <span className="block text-xs font-normal text-ink-muted">{c.domain}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-muted">{c.industry ?? "—"}</TableCell>
                  <TableCell className="text-ink-muted">{c.size ?? "—"}</TableCell>
                  <TableCell className="hidden text-ink-muted lg:table-cell">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {c.annualRevenue ? formatCompact(c.annualRevenue, "USD") : "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">{timeAgo(c.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal title="New company" open={showNew} onClose={() => setShowNew(false)} wide>
        <CompanyForm
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>
    </div>
  );
}
