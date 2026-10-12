"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Box, Building2, Target, Users } from "lucide-react";

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
const API_NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;
const RECORD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function hrefFor(r: SearchResult): string {
  return (TYPE_PATH[r.type] ?? `/objects/${r.type}/`) + r.id;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSearchResults(value: unknown): SearchResult[] {
  if (!isRecord(value) || !Array.isArray(value.results)) return [];

  return value.results.flatMap((candidate): SearchResult[] => {
    if (!isRecord(candidate)) return [];
    const type = candidate.type;
    const id = candidate.id;
    const title = candidate.title;
    const subtitle = candidate.subtitle;
    if (
      typeof type !== "string" ||
      (!TYPE_PATH[type] && !API_NAME_RE.test(type)) ||
      typeof id !== "string" ||
      !RECORD_ID_RE.test(id) ||
      typeof title !== "string" ||
      !title.trim() ||
      (subtitle !== null && typeof subtitle !== "string")
    ) {
      return [];
    }
    return [{ type, id, title, subtitle }];
  });
}

function parseCustomNavigation(
  value: unknown,
  tr: ReturnType<typeof translator>,
): { title: string; href: string }[] {
  if (!isRecord(value) || !Array.isArray(value.objects)) return [];

  return value.objects.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const apiName = candidate.apiName;
    const namePlural = candidate.namePlural;
    if (
      typeof apiName !== "string" ||
      !API_NAME_RE.test(apiName) ||
      typeof namePlural !== "string" ||
      !namePlural.trim()
    ) {
      return [];
    }
    return [{ title: tr("cmd.goTo", { name: namePlural }), href: "/objects/" + apiName }];
  });
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
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSearchFailed(false);
    setLoading(false);
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
          parseCustomNavigation(d, tr),
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
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const trimmedQuery = query.trim();
    if (!open || !trimmedQuery) {
      setResults([]);
      setSearchFailed(false);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setSearchFailed(false);
    setResults([]);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/search?q=" + encodeURIComponent(trimmedQuery), {
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(String(res.status));
          const data: unknown = await res.json();
          if (ctrl.signal.aborted || requestId !== requestIdRef.current) return;
          setSearchFailed(false);
          setResults(parseSearchResults(data));
        } catch {
          if (ctrl.signal.aborted || requestId !== requestIdRef.current) return;
          setSearchFailed(true);
          setResults([]);
        } finally {
          if (!ctrl.signal.aborted && requestId === requestIdRef.current) {
            setLoading(false);
          }
        }
      })();
    }, 120);

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query, searchRetry]);

  function go(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next: boolean) => !next && onClose()}
      finalFocus={() => {
        const sheet = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-slot="sheet-content"][data-open]',
          ),
        ].at(-1);
        if (sheet) {
          return (
            sheet.querySelector<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ) ?? sheet
          );
        }

        // A route change can remove the element that held focus before the
        // palette opened (for example, browser Back closing a preview below
        // it). Give Base UI a stable, visible target instead of letting focus
        // fall through to document.body.
        const trigger = [
          ...document.querySelectorAll<HTMLElement>(
            "[data-command-palette-trigger]",
          ),
        ].find(
          (candidate) =>
            candidate.isConnected &&
            candidate.getClientRects().length > 0 &&
            !candidate.closest('[inert], [aria-hidden="true"], [hidden]'),
        );
        return trigger ?? document.getElementById("main") ?? false;
      }}
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

          {loading && (
            <CommandGroup heading={t("cmd.records")}>
              <CommandItem value="search-loading" disabled>
                <span role="status" className="text-sm text-ink-muted">
                  {t("common.loading")}
                </span>
              </CommandItem>
            </CommandGroup>
          )}

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
