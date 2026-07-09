"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBuilding,
  IconChart,
  IconCheckSquare,
  IconDashboard,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
  IconTarget,
  IconUsers,
  IconZap,
} from "./icons";
import { CommandPalette } from "./command-palette";
import { AiChat } from "./ai-chat";
import { LocaleProvider } from "@/lib/i18n/provider";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";

const NAV: { href: string; key: MessageKey; icon: typeof IconDashboard }[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: IconDashboard },
  { href: "/contacts", key: "nav.contacts", icon: IconUsers },
  { href: "/companies", key: "nav.companies", icon: IconBuilding },
  { href: "/deals", key: "nav.deals", icon: IconTarget },
  { href: "/tasks", key: "nav.tasks", icon: IconCheckSquare },
  { href: "/reports", key: "nav.reports", icon: IconChart },
  { href: "/workflows", key: "nav.workflows", icon: IconZap },
  { href: "/settings", key: "nav.settings", icon: IconSettings },
];

// Primary items for the mobile bottom bar
const MOBILE_NAV = NAV.filter((n) =>
  ["/dashboard", "/contacts", "/deals", "/tasks"].includes(n.href),
);

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("fourty-theme", next ? "dark" : "light");
  }
  return (
    <button
      onClick={toggle}
      className="btn-ghost !px-2.5"
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

export function AppShell({
  user,
  locale,
  aiEnabled,
  children,
}: {
  user: { name: string; email: string };
  locale: Locale;
  aiEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const t = translator(locale);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-sm font-extrabold text-white">
            40
          </div>
          <span className="text-lg font-bold tracking-tight">Fourty</span>
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted transition hover:border-accent-400"
        >
          <IconSearch width={15} height={15} />
          <span>Search…</span>
          <kbd className="ml-auto rounded border border-line bg-surface px-1.5 text-[10px] font-semibold">
            ⌘K
          </kbd>
        </button>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-accent-600/10 text-accent-600 dark:text-accent-400"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon width={17} height={17} />
                {t(key)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-600/15 text-xs font-bold text-accent-600 dark:text-accent-400">
              {user.name
                .split(/\s+/)
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                onClick={logout}
                className="btn-ghost !px-2.5"
                title="Sign out"
                aria-label="Sign out"
              >
                <IconLogout width={16} height={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-xs font-extrabold text-white">
            40
          </div>
          <span className="font-bold">Fourty</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPaletteOpen(true)}
            className="btn-ghost !px-2.5"
            aria-label="Search"
          >
            <IconSearch width={16} height={16} />
          </button>
          <ThemeToggle />
          <button onClick={logout} className="btn-ghost !px-2.5" aria-label="Sign out">
            <IconLogout width={16} height={16} />
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MOBILE_NAV.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-accent-600 dark:text-accent-400" : "text-ink-muted"
              }`}
            >
              <Icon width={19} height={19} />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-16 md:ml-56 md:px-8 md:pb-10 md:pt-8">
        {children}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AiChat enabled={aiEnabled} />
    </div>
    </LocaleProvider>
  );
}
