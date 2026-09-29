"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BellIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import { logout } from "@/actions/auth";
import type { Role } from "@/db/schema";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/roles";
import { Logo } from "@/components/logo";
import { useTheme } from "@/components/theme-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { breadcrumbFor, buildNav, type NavCounts, type NavItem } from "./nav";
import { CommandMenu } from "./command-menu";

export type ShellUser = { id: number; name: string; email: string; role: Role };

export function AppShell({ user, counts, children }: { user: ShellUser; counts: NavCounts; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const pathname = usePathname();
  const nav = React.useMemo(() => buildNav(user.role, counts), [user.role, counts]);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar") === "collapsed");
    } catch {}
  }, []);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem("sidebar", v ? "expanded" : "collapsed");
      } catch {}
      return !v;
    });
  };

  const sidebar = (mobile: boolean) => (
    <SidebarContent
      user={user}
      nav={nav}
      collapsed={!mobile && collapsed}
      onToggle={mobile ? () => setMobileOpen(false) : toggleCollapsed}
      onSearch={() => setSearchOpen(true)}
    />
  );

  return (
    <div className="flex min-h-dvh bg-sidebar">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 lg:flex",
          collapsed ? "w-[60px]" : "w-[240px]",
        )}
      >
        {sidebar(false)}
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          {sidebar(true)}
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col bg-background lg:my-1.5 lg:mr-1.5 lg:rounded-xl lg:border">
        <MobileHeader onMenu={() => setMobileOpen(true)} counts={counts} role={user.role} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 pt-3 pb-6 sm:px-5 lg:pt-5">{children}</main>
      </div>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} nav={nav} />
    </div>
  );
}

function SidebarContent({
  user,
  nav,
  collapsed,
  onToggle,
  onSearch,
}: {
  user: ShellUser;
  nav: ReturnType<typeof buildNav>;
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-2.5 pt-3 pb-2.5">
      <div className={cn("flex items-center px-1.5", collapsed ? "flex-col gap-3" : "justify-between")}>
        <Link href="/dashboard" aria-label="KPI Ads home">
          <Logo collapsed={collapsed} />
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <PanelLeftIcon className="size-4" />
        </button>
      </div>
      <div className="dashed-divider my-2.5" />

      <button
        type="button"
        onClick={onSearch}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border bg-card text-[13px] text-muted-foreground transition-colors hover:text-foreground",
          collapsed ? "justify-center" : "px-2.5",
        )}
        aria-label="Search"
      >
        <SearchIcon className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search anything</span>
            <kbd className="text-xs tracking-widest text-foreground/70">⌘K</kbd>
          </>
        )}
      </button>

      <nav className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
        {nav.map((section) => (
          <div key={section.label} className="mt-3 first:mt-1">
            {!collapsed && (
              <p className="mb-1 px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{section.label}</p>
            )}
            {collapsed && <div className="dashed-divider mx-2 mb-2" />}
            <ul className="grid gap-0.5">
              {section.items.map((item) => (
                <NavLink key={item.title} item={item} collapsed={collapsed} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <UserMenu user={user} collapsed={collapsed} />
    </div>
  );
}

function useIsActive() {
  const pathname = usePathname();
  const search = useSearchParams();
  return (href: string, exact = false) => {
    const [path, query] = href.split("?");
    if (query) {
      const q = new URLSearchParams(query);
      return pathname === path && [...q].every(([k, v]) => search.get(k) === v);
    }
    if (exact) return pathname === path && !search.get("status");
    return pathname === path || pathname.startsWith(`${path}/`);
  };
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const isActive = useIsActive();
  const active = isActive(item.href) || !!item.children?.some((c) => isActive(c.href));
  const [open, setOpen] = React.useState(active);
  const Icon = item.icon;

  const base = cn(
    "group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
    active && !item.children
      ? "bg-card font-medium text-foreground ring-1 ring-border"
      : "text-foreground/80 hover:bg-accent hover:text-foreground",
    collapsed && "justify-center px-0",
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={cn(base, active && "bg-card text-foreground ring-1 ring-border")}
            >
              <Icon className="size-4" />
              <span className="sr-only">{item.title}</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.title}</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  if (!item.children) {
    return (
      <li>
        <Link href={item.href} className={base} aria-current={active ? "page" : undefined}>
          <Icon className="size-4 shrink-0" />
          <span className="flex-1 truncate">{item.title}</span>
          {!!item.badge && <CountBadge n={item.badge} />}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className={base}>
          <Icon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">{item.title}</span>
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mb-0.5 grid">
            {item.children.map((child, i) => {
              const childActive = isActive(child.href, child.href === item.href);
              const last = i === item.children!.length - 1;
              return (
                <li key={child.href} className="relative pl-[34px]">
                  {/* tree connector */}
                  <span aria-hidden className={cn("absolute left-[17px] top-0 w-px bg-border", last ? "h-1/2" : "h-full")} />
                  <span aria-hidden className="absolute top-1/2 left-[17px] h-px w-2 bg-border" />
                  <span aria-hidden className="absolute top-1/2 left-[25px] size-[5px] -translate-y-1/2 rounded-full border border-muted-foreground/60 bg-sidebar" />
                  <Link
                    href={child.href}
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
                      childActive ? "font-medium text-foreground" : "text-foreground/70 hover:text-foreground",
                    )}
                    aria-current={childActive ? "page" : undefined}
                  >
                    <span className="flex-1 truncate">{child.title}</span>
                    {!!child.badge && <CountBadge n={child.badge} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="btn-primary-gradient inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium text-primary-foreground tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function UserMenu({ user, collapsed }: { user: ShellUser; collapsed: boolean }) {
  const { dark, toggle } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "mt-2 flex items-center gap-2.5 rounded-lg border bg-card p-2 text-left outline-none transition-colors hover:bg-accent/60",
          collapsed && "justify-center p-1.5",
        )}
      >
        <UserAvatar name={user.name} online />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{user.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => (e.preventDefault(), toggle())}>
          {dark ? <SunIcon /> : <MoonIcon />} {dark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
          <LogOutIcon className="text-destructive" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileHeader({ onMenu, counts, role }: { onMenu: () => void; counts: NavCounts; role: Role }) {
  const pathname = usePathname();
  const crumb = breadcrumbFor(pathname);
  const { dark, toggle } = useTheme();
  const total = counts.pendingReviews + counts.openTasks + counts.revisions;
  return (
    <header className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur lg:hidden">
      <button type="button" onClick={onMenu} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Open menu">
        <PanelLeftIcon className="size-[18px]" />
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="truncate text-muted-foreground">{crumb.section}</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="truncate font-medium">{crumb.page}</span>
      </nav>
      <NotificationBell counts={counts} role={role} total={total} />
      <button type="button" onClick={toggle} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Toggle theme">
        {dark ? <SunIcon className="size-[18px]" /> : <MoonIcon className="size-[18px]" />}
      </button>
    </header>
  );
}

export function NotificationBell({ counts, role, total }: { counts: NavCounts; role: Role; total: number }) {
  const items =
    role === "supervisor"
      ? [{ label: `${counts.pendingReviews} reports waiting for review`, href: "/reports?status=submitted", n: counts.pendingReviews }]
      : [
          { label: `${counts.openTasks} open tasks assigned to you`, href: "/tasks", n: counts.openTasks },
          { label: `${counts.revisions} reports need revision`, href: "/reports?status=revision", n: counts.revisions },
        ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-md p-1.5 text-muted-foreground outline-none hover:bg-accent" aria-label="Notifications">
        <BellIcon className="size-[18px]" />
        {total > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.every((i) => i.n === 0) ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          items
            .filter((i) => i.n > 0)
            .map((i) => (
              <DropdownMenuItem key={i.href} asChild>
                <Link href={i.href}>{i.label}</Link>
              </DropdownMenuItem>
            ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
