"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DialogFocusScope } from "./ui";
import { IconArrowRight, IconBuilding, IconSearch, IconTarget, IconUsers } from "./icons";
import { type MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";

type EntityType = "contact" | "company" | "deal";

type SearchResult = {
  type: EntityType;
  id: string;
  title: string;
  subtitle: string | null;
};

type PaletteItem = {
  key: string;
  title: string;
  subtitle: string | null;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  type?: EntityType;
  go: () => void;
};

const NAV_COMMANDS = [
  { title: "Go to Dashboard", href: "/dashboard" },
  { title: "Go to Contacts", href: "/contacts" },
  { title: "Go to Companies", href: "/companies" },
  { title: "Go to Deals", href: "/deals" },
  { title: "Go to Tasks", href: "/tasks" },
  { title: "Go to Reports", href: "/reports" },
  { title: "Go to Workflows", href: "/workflows" },
  { title: "Go to Settings", href: "/settings" },
  { title: "New contact", href: "/contacts?new=1" },
  { title: "New company", href: "/companies?new=1" },
  { title: "New deal", href: "/deals?new=1" },
];

const TYPE_ICON: Record<EntityType, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  contact: IconUsers,
  company: IconBuilding,
  deal: IconTarget,
};

const TYPE_LABEL_KEY: Record<EntityType, MessageKey> = {
  contact: "cmdk.type.contact",
  company: "cmdk.type.company",
  deal: "cmdk.type.deal",
};

const TYPE_PATH: Record<EntityType, string> = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

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
      (type !== "contact" && type !== "company" && type !== "deal") ||
      typeof id !== "string" ||
      typeof title !== "string" ||
      !id.trim() ||
      !title.trim() ||
      (subtitle !== null && typeof subtitle !== "string")
    ) {
      return [];
    }
    return [{ type, id, title, subtitle }];
  });
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const navMatches = query
    ? NAV_COMMANDS.filter((command) => command.title.toLowerCase().includes(query.toLowerCase())).slice(0, 4)
    : NAV_COMMANDS.slice(0, 6);

  const recordItems: PaletteItem[] = results.map((result) => ({
    key: `record-${result.type}-${result.id}`,
    title: result.title,
    subtitle: result.subtitle,
    icon: TYPE_ICON[result.type],
    type: result.type,
    go: () => router.push(TYPE_PATH[result.type] + result.id),
  }));

  const navigationItems: PaletteItem[] = navMatches.map((command) => ({
    key: `navigation-${command.href}`,
    title: command.title,
    subtitle: null,
    icon: IconArrowRight,
    go: () => router.push(command.href),
  }));

  const groups = [
    { key: "records", labelKey: "cmdk.group.records" as const, items: recordItems },
    { key: "navigation", labelKey: "cmdk.group.navigation" as const, items: navigationItems },
  ].filter((group) => group.items.length > 0);
  let itemIndex = 0;
  const indexedGroups = groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ item, index: itemIndex++ })),
  }));
  const items = indexedGroups.flatMap((group) => group.items.map(({ item }) => item));
  const selectedIndex = Math.min(selected, Math.max(0, items.length - 1));
  const activeId = items[selectedIndex] ? `cmdk-opt-${selectedIndex}` : undefined;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSearchError(false);
    setLoading(false);
    setSelected(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const trimmedQuery = query.trim();
    if (!open || !trimmedQuery) {
      setResults([]);
      setLoading(false);
      setSearchError(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearchError(false);
    setResults([]);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Search failed with ${response.status}`);
          const data: unknown = await response.json();
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          setResults(parseSearchResults(data));
          setSelected(0);
        } catch (error) {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          setResults([]);
          setSearchError(true);
        } finally {
          if (!controller.signal.aborted && requestId === requestIdRef.current) setLoading(false);
        }
      })();
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, retryNonce]);

  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== inputRef.current) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, Math.max(0, items.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === "Home" && items.length > 0) {
      event.preventDefault();
      setSelected(0);
    } else if (event.key === "End" && items.length > 0) {
      event.preventDefault();
      setSelected(items.length - 1);
    } else if (event.key === "Enter" && items[selectedIndex]) {
      event.preventDefault();
      items[selectedIndex].go();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <DialogFocusScope
        open={open}
        onClose={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        className="card w-full max-w-lg animate-fade-up overflow-hidden shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <IconSearch width={16} height={16} className="text-ink-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts, companies, deals — or jump anywhere…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-muted/60"
            role="combobox"
            aria-expanded={items.length > 0 || loading || searchError}
            aria-controls="cmdk-list"
            aria-activedescendant={activeId}
            aria-label="Search or jump to a page"
            aria-autocomplete="list"
            aria-busy={loading}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
            esc
          </kbd>
        </div>
        <div
          id="cmdk-list"
          role="listbox"
          aria-label="Results"
          aria-busy={loading}
          className="max-h-80 overflow-y-auto p-2"
        >
          {searchError && (
            <div role="alert" className="state-error flex items-center justify-between gap-3 px-3 py-4 text-sm">
              <span>{t("cmdk.search.error")}</span>
              <button
                type="button"
                className="btn-ghost !border-red-300 !px-2.5 !py-1.5 text-xs"
                onClick={() => setRetryNonce((value) => value + 1)}
              >
                {t("action.retry")}
              </button>
            </div>
          )}
          {loading && !searchError && (
            <p className="px-3 py-4 text-center text-sm text-ink-muted">{t("cmdk.search.loading")}</p>
          )}
          {!loading && !searchError && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">{t("common.noResults")}</p>
          )}
          {indexedGroups.map((group) => (
            <div key={group.key} role="group" aria-label={t(group.labelKey)}>
              <p className="cmdk-group-label px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide">
                {t(group.labelKey)}
              </p>
              {group.items.map(({ item, index }) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    id={`cmdk-opt-${index}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    onClick={() => {
                      item.go();
                      onClose();
                    }}
                    onMouseEnter={() => setSelected(index)}
                    className={`cmdk-option flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                      index === selectedIndex ? "text-accent-700 dark:text-accent-300" : ""
                    }`}
                  >
                    <Icon width={15} height={15} className="shrink-0 text-ink-muted" aria-hidden="true" />
                    <span className="min-w-0 truncate font-medium">{item.title}</span>
                    {item.subtitle && <span className="min-w-0 truncate text-xs text-ink-muted">{item.subtitle}</span>}
                    {item.type && <span className="cmdk-badge">{t(TYPE_LABEL_KEY[item.type])}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogFocusScope>
    </div>
  );
}
