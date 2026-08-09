"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Target, Users } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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

const TYPE_ICON = { contact: Users, company: Building2, deal: Target };
const TYPE_PATH = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
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

  function go(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Command palette"
      description="Search contacts, companies and deals, or jump to a page."
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
          placeholder="Search contacts, companies, deals — or jump anywhere…"
        />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>

          {results.length > 0 && (
            <CommandGroup heading="Records">
              {results.map((r) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    value={`${r.type}-${r.id}`}
                    onSelect={() => go(TYPE_PATH[r.type] + r.id)}
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

          <CommandGroup heading="Jump to">
            {NAV_COMMANDS.filter((c) =>
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
                  <ArrowRight className="shrink-0 text-ink-muted" />
                  <span className="truncate font-medium">{c.title}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
