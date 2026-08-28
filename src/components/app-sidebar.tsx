"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Box,
  Building2,
  ChartColumn,
  CheckSquare,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { useTheme } from "@/components/theme-provider";
import { initials } from "@/lib/format";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";

export const NAV: { href: string; key: MessageKey; icon: LucideIcon }[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/contacts", key: "nav.contacts", icon: Users },
  { href: "/companies", key: "nav.companies", icon: Building2 },
  { href: "/deals", key: "nav.deals", icon: Target },
  { href: "/tasks", key: "nav.tasks", icon: CheckSquare },
  { href: "/reports", key: "nav.reports", icon: ChartColumn },
  { href: "/workflows", key: "nav.workflows", icon: Zap },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

/** A nav row is active on its own page and on anything nested beneath it. */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavMain({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = translator(locale);

  return (
    <SidebarGroup>
      {/* shadcn's sidebar parts are all divs, so the navigation landmark has to
          be declared here or screen-reader users lose it entirely. */}
      <SidebarGroupContent>
        <nav aria-label="Main">
          <SidebarMenu>
            {NAV.map(({ href, key, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              const label = t(key);
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={label}
                    render={
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Custom objects, straight from their definitions — the group only exists when
 * at least one is defined. The settings panel fires `fourty:objects-changed`
 * after creating or deleting one, so the list stays fresh without a reload.
 */
function NavObjects({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = translator(locale);
  const [objects, setObjects] = useState<{ id: string; apiName: string; namePlural: string }[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/custom-objects").catch(() => null);
      if (res?.ok && alive) setObjects((await res.json()).objects ?? []);
    };
    load();
    window.addEventListener("fourty:objects-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("fourty:objects-changed", load);
    };
  }, []);

  if (objects.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <nav aria-label={t("nav.objects")}>
          <SidebarMenu>
            {objects.map((o) => {
              const href = `/objects/${o.apiName}`;
              const active = isActivePath(pathname, href);
              return (
                <SidebarMenuItem key={o.id}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={o.namePlural}
                    render={
                      <Link href={href} aria-current={active ? "page" : undefined} />
                    }
                  >
                    <Box />
                    <span>{o.namePlural}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Footer account row. Collapsed to an avatar when the sidebar is in icon mode;
 * the dropdown keeps theme and sign-out reachable in both states.
 */
function NavUser({
  user,
  onSignOut,
}: {
  user: { name: string; email: string };
  onSignOut: () => void;
}) {
  const { isMobile } = useSidebar();
  const { dark, toggle } = useTheme();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            render={<SidebarMenuButton size="lg" tooltip={user.name} />}
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-accent-600/15 text-xs font-bold text-accent-700 dark:text-accent-400">
                {initials(user.name || "?")}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-ink-muted">
                {user.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            {/* Base UI requires a group label to live inside a Menu.Group —
                rendering DropdownMenuLabel on its own throws at click time. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-accent-600/15 text-xs font-bold text-accent-700 dark:text-accent-400">
                      {initials(user.name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-ink-muted">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggle}>
              {dark ? <Sun /> : <Moon />}
              Toggle theme
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({
  user,
  locale,
  onSearch,
  onSignOut,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string };
  locale: Locale;
  onSearch: () => void;
  onSignOut: () => void;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Fourty"
              render={<Link href="/dashboard" />}
            >
              {/* Two lockups, one at a time: the 40 monogram is all that fits
                  the 3rem rail, and the full lockup takes over the moment the
                  sidebar has the width for it. Neither sits on a coloured tile —
                  the O is the brand orange and would vanish into one.
                  Both carry the name: the hidden one is display:none and so is
                  out of the accessibility tree, which leaves the link with
                  exactly one accessible name in either state. */}
              <Logo
                variant="compact"
                height={17}
                title="Fourty"
                className="hidden shrink-0 group-data-[collapsible=icon]:block"
              />
              <Logo
                variant="full"
                height={20}
                title="Fourty"
                className="shrink-0 group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onSearch}
              tooltip="Search"
              className="text-ink-muted"
            >
              <Search />
              <span>Search…</span>
              <Kbd className="ml-auto">⌘K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain locale={locale} />
        <NavObjects locale={locale} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onSignOut={onSignOut} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
