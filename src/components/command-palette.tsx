"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconBuilding, IconSearch, IconTarget, IconUsers, IconArrowRight } from "./icons";

type SearchResult = {
  type: "contact" | "company" | "deal";
  id: string;
  title: string;
  subtitle: string | null;
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

const TYPE_ICON = { contact: IconUsers, company: IconBuilding, deal: IconTarget };
const TYPE_PATH = { contact: "/contacts/", company: "/companies/", deal: "/deals/" };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const navMatches = query
    ? NAV_COMMANDS.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())).slice(0, 4)
    : NAV_COMMANDS.slice(0, 6);

  const items: { title: string; subtitle?: string | null; icon?: React.FC<React.SVGProps<SVGSVGElement>>; go: () => void }[] = [
    ...results.map((r) => ({
      title: r.title,
      subtitle: r.subtitle,
      icon: TYPE_ICON[r.type],
      go: () => router.push(TYPE_PATH[r.type] + r.id),
    })),
    ...navMatches.map((c) => ({
      title: c.title,
      subtitle: null,
      icon: IconArrowRight,
      go: () => router.push(c.href),
    })),
  ];

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
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
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setSelected(0);
        }
      } catch {
        /* aborted */
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && items[selected]) {
      e.preventDefault();
      items[selected].go();
      onClose();
    }
  }

  const activeId = items[selected] ? `cmdk-opt-${selected}` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card w-full max-w-lg animate-fade-up overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <IconSearch width={16} height={16} className="text-ink-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts, companies, deals — or jump anywhere…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-muted/60"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="cmdk-list"
            aria-activedescendant={activeId}
            aria-label="Search or jump to a page"
            aria-autocomplete="list"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
            esc
          </kbd>
        </div>
        <div id="cmdk-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">No results</p>
          )}
          {items.map((item, i) => {
            const Icon = item.icon ?? IconArrowRight;
            return (
              <button
                key={i}
                id={`cmdk-opt-${i}`}
                role="option"
                aria-selected={i === selected}
                onClick={() => {
                  item.go();
                  onClose();
                }}
                onMouseEnter={() => setSelected(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                  i === selected ? "bg-accent-600/10 text-accent-700 dark:text-accent-300" : ""
                }`}
              >
                <Icon width={15} height={15} className="shrink-0 text-ink-muted" aria-hidden="true" />
                <span className="truncate font-medium">{item.title}</span>
                {item.subtitle && (
                  <span className="ml-auto truncate text-xs text-ink-muted">{item.subtitle}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
