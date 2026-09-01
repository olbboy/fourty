"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Box, Building2, Target, Users } from "lucide-react";
import type { CustomObjectDef } from "@/lib/types";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useLocale, useT } from "@/lib/i18n/provider";
import { translator, type MessageKey } from "@/lib/i18n";

type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
};

const GO_TO: { href: string; key: MessageKey }[] = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/contacts", key: "nav.contacts" },
  { href: "/companies", key: "nav.companies" },
  { href: "/deals", key: "nav.deals" },
  { href: "/tasks", key: "nav.tasks" },
  { href: "/reports", key: "nav.reports" },
  { href: "/workflows", key: "nav.workflows" },
  { href: "/settings", key: "nav.settings" },
];

const CREATE: { href: string; key: MessageKey }[] = [
  { href: "/contacts?new=1", key: "page.contacts.new" },
  { href: "/companies?new=1", key: "page.companies.new" },
  { href: "/deals?new=1", key: "page.deals.new" },
];

const TYPE_ICON = { contact: Users, company: Building2, deal: Target } as const;
const TYPE_PATH: Record<string, string> = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

function hrefFor(r: SearchResult): string {
  return (TYPE_PATH[r.type] ?? `/objects/${r.type}/`) + r.id;
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [customNav, setCustomNav] = useState<{ title: string; href: string }[]>([]);
  const [objectsFailed, setObjectsFailed] = useState(false);
  const [objectsRetry, setObjectsRetry] = useState(0);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tr = translator(locale);
    fetch("/api/custom-objects")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setObjectsFailed(false);
        setCustomNav(
          ((Array.isArray(d.objects) ? d.objects : []) as CustomObjectDef[]).map((o) => ({
            title: tr("cmd.goTo", { name: o.namePlural }),
            href: `/objects/${o.apiName}`,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setObjectsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, locale, objectsRetry]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchFailed(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setSearchFailed(false);
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (ctrl.signal.aborted) return;
        setSearchFailed(true);
        setResults([]);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, searchRetry]);

  function go(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("cmd.title")}
      description={t("cmd.description")}
      className="max-w-lg"
    >
      {/* CommandDialog drops its children straight into the dialog, so the
          Command root is ours to place — which is also where filtering is
          switched off: record search runs server-side and cmdk's fuzzy filter
          would drop rows that matched on a field the label doesn't show. */}
      <Command shouldFilter={false}>
        {/* Base UI's dialog does not move focus into the command input on its
            own, and a palette you cannot type into is useless — so ask for it. */}
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={t("cmd.placeholder")}
        />
        <CommandList>
          <CommandEmpty>{t("common.noResults")}</CommandEmpty>

          {searchFailed && (
            <CommandGroup heading={t("cmd.records")}>
              <CommandItem
                value="retry-search"
                onSelect={() => setSearchRetry((n) => n + 1)}
              >
                <Box className="shrink-0 text-ink-muted" />
                <span className="truncate font-medium">{t("error.loadFailed")}</span>
                <span className="ml-auto text-xs text-ink-muted">{t("action.retry")}</span>
              </CommandItem>
            </CommandGroup>
          )}

          {results.length > 0 && (
            <CommandGroup heading={t("cmd.records")}>
              {results.map((r) => {
                const Icon = TYPE_ICON[r.type as keyof typeof TYPE_ICON] ?? Box;
                return (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    value={`${r.type}-${r.id}`}
                    onSelect={() => go(hrefFor(r))}
                  >
                    <Icon className="shrink-0 text-ink-muted" />
                    <span className="truncate font-medium">{r.title}</span>
                    {r.subtitle && (
                      <span className="ml-auto truncate text-xs text-ink-muted">
                        {r.subtitle}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {objectsFailed && (
            <CommandGroup heading={t("settings.customObjects")}>
              <CommandItem
                value="retry-custom-objects"
                onSelect={() => setObjectsRetry((n) => n + 1)}
              >
                <Box className="shrink-0 text-ink-muted" />
                <span className="truncate font-medium">{t("error.loadFailed")}</span>
                <span className="ml-auto text-xs text-ink-muted">{t("action.retry")}</span>
              </CommandItem>
            </CommandGroup>
          )}

          <CommandGroup heading={t("cmd.jump")}>
            {[
              ...GO_TO.map((c) => ({ href: c.href, title: t("cmd.goTo", { name: t(c.key) }) })),
              ...CREATE.map((c) => ({ href: c.href, title: t(c.key) })),
              ...(objectsFailed ? [] : customNav),
            ]
              .filter((c) =>
                query
                  ? c.title.toLowerCase().includes(query.toLowerCase())
                  : true,
              )
              .slice(0, query ? 4 : 6)
              .map((c) => (
                <CommandItem
                  key={c.href}
                  value={c.title}
                  onSelect={() => go(c.href)}
                >
                  {c.href.startsWith("/objects/") ? (
                    <Box className="shrink-0 text-ink-muted" />
                  ) : (
                    <ArrowRight className="shrink-0 text-ink-muted" />
                  )}
                  <span className="truncate font-medium">{c.title}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
