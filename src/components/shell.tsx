"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Moon, Search, Sun } from "lucide-react";

import { AppSidebar, isActivePath, NAV } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { AiChat } from "./ai-chat";
import { AiEnabledProvider } from "./ai-enabled";
import { ThemeProvider, useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { LocaleProvider } from "@/lib/i18n/provider";
import { translator, type Locale } from "@/lib/i18n";

// Primary items for the mobile bottom bar. The rest of the nav stays reachable
// on mobile through the sidebar sheet behind the top-bar trigger.
const MOBILE_NAV = NAV.filter((n) =>
  ["/dashboard", "/contacts", "/deals", "/tasks"].includes(n.href),
);

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function AppShellInner({
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

  const current = NAV.find((n) => isActivePath(pathname, n.href));

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <AppSidebar
        user={user}
        locale={locale}
        onSearch={() => setPaletteOpen(true)}
        onSignOut={logout}
      />

      <SidebarInset className="min-w-0">
        {/* Desktop header — collapse trigger plus where you are. */}
        <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 md:flex">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <span className="text-sm font-medium">
            {current ? t(current.key) : "Fourty"}
          </span>
        </header>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <span className="font-bold">
              {current ? t(current.key) : "Fourty"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search />
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut />
            </Button>
          </div>
        </header>

        <main
          id="main"
          className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6"
        >
          <AiEnabledProvider enabled={aiEnabled}>{children}</AiEnabledProvider>
        </main>
      </SidebarInset>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MOBILE_NAV.map(({ href, key, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active
                  ? "text-accent-600 dark:text-accent-400"
                  : "text-ink-muted"
              }`}
            >
              <Icon width={19} height={19} />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <AiChat enabled={aiEnabled} />
    </>
  );
}

export function AppShell({
  user,
  locale,
  aiEnabled,
  defaultSidebarOpen,
  children,
}: {
  user: { name: string; email: string };
  locale: Locale;
  aiEnabled: boolean;
  /** Read from the sidebar_state cookie on the server so the rail doesn't flash. */
  defaultSidebarOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider locale={locale}>
      <ThemeProvider>
        <SidebarProvider defaultOpen={defaultSidebarOpen}>
          <AppShellInner user={user} locale={locale} aiEnabled={aiEnabled}>
            {children}
          </AppShellInner>
        </SidebarProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
