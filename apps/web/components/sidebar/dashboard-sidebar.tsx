"use client";

import { useEffect, useRef } from "react";
import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Github, Mail, MailPlus, MessageSquare, LogOut, Users, Users2 } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { WorkspaceSwitcher } from "@/components/sidebar/workspace-switcher";
import { SIDEBAR_NAV_ITEM_CLASS } from "@/components/sidebar/nav-item-class";
import { authClient, useSession } from "@/lib/auth-client";
import { clearSignedInHint, setSignedInHint } from "@/lib/signed-in-hint";
import { useSystemInfo } from "@/hooks/use-system-info";
import { GalleryVerticalEndIcon } from "../ui/gallery-vertical-end";
import { SettingsIcon } from "../ui/settings";
import { CpuIcon } from "../ui/cpu";
import { LayersIcon } from "../ui/layers";
import { BoxesIcon } from "../ui/boxes";
import { BellIcon } from "../ui/bell";
import { ChartPieIcon } from "../ui/chart-pie";

// ─── Navigation config ──────────────────────────────────────────────────────

interface NavItemData {
  title: string;
  href: string;
  icon: React.ElementType;
  /**
   * Hidden unless the API reports DEPLOYMENT_MODE=cloud. The page behind a
   * cloud-only entry is stripped from the open-source build, so linking to it
   * from a self-hosted install would 404.
   */
  cloudOnly?: boolean;
}

const navSections: { label: string; items: readonly NavItemData[] }[] = [
  {
    label: "Deploy",
    items: [
      { title: "Projects", href: "/dashboard", icon: GalleryVerticalEndIcon },
      { title: "Instances", href: "/dashboard/instances", icon: CpuIcon },
    ],
  },
  {
    label: "Configure",
    items: [
      { title: "Models", href: "/dashboard/models", icon: BoxesIcon },
      { title: "Providers", href: "/dashboard/providers", icon: LayersIcon },
      { title: "Members", href: "/dashboard/members", icon: Users2 },
      { title: "Billing", href: "/dashboard/billing", icon: CreditCard, cloudOnly: true },
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
    ],
  },
  {
    label: "Monitor",
    items: [
      { title: "Spendings", href: "/dashboard/spendings", icon: ChartPieIcon },
      { title: "Alerts", href: "/dashboard/alerts", icon: BellIcon },
      { title: "Users", href: "/dashboard/users", icon: Users },
      { title: "Waitlist", href: "/dashboard/waitlist", icon: MailPlus, cloudOnly: true },
    ],
  },
];

const supportItems = [
  {
    title: "Discord",
    href: "https://discord.gg/llmpanel",
    icon: MessageSquare,
  },
  {
    title: "GitHub",
    href: "https://github.com/llmpanel-dev/llmpanel",
    icon: Github,
  },
  { title: "Email", href: "mailto:support@llmpanel.io", icon: Mail },
] as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

function NavItem({
  item,
  isActive,
  onClick,
}: {
  item: NavItemData;
  isActive: boolean;
  onClick: () => void;
}) {
  const iconRef = useRef<{
    startAnimation: () => void;
    stopAnimation: () => void;
  }>(null);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.title}
        className={SIDEBAR_NAV_ITEM_CLASS}
      >
        <Link
          href={item.href}
          prefetch={true}
          onClick={onClick}
          onMouseEnter={() => iconRef.current?.startAnimation?.()}
          onMouseLeave={() => iconRef.current?.stopAnimation?.()}
        >
          <Icon ref={iconRef} size={16} />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SupportItem({
  item,
}: {
  item: { title: string; href: string; icon: React.ElementType };
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild size="sm" tooltip={item.title}>
        <a href={item.href} target="_blank" rel="noopener noreferrer">
          <Icon className="size-4" />
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function UserFooter() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  // Keep the marketing site's signed-in hint fresh on every dashboard visit,
  // regardless of how the session was created (login, register, invite).
  useEffect(() => {
    if (user) setSignedInHint();
  }, [user]);

  const initials = (user?.name ?? user?.email ?? "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await authClient.signOut();
    clearSignedInHint();
    window.location.href = "/";
  };

  return (
    <div className="flex flex-col gap-2 group-data-[collapsible=icon]:gap-1">
      {/* Theme toggle — hidden when collapsed to icon rail */}
      <div className="px-1 group-data-[collapsible=icon]:hidden">
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
        <Avatar size="sm" className="shrink-0">
          {user?.image && (
            <AvatarImage src={user.image} alt={user?.name ?? ""} />
          )}
          <AvatarFallback className="text-[10px] font-medium">
            {isPending ? "" : initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-xs font-medium leading-tight">
            {isPending ? "Loading…" : (user?.name ?? "Account")}
          </p>
          {user?.email && (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {user.email}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground group-data-[collapsible=icon]:hidden"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isMobile, toggleSidebar } = useSidebar();
  // Defaults to "self-hosted" while loading, so a cloud-only entry never
  // flashes into view on a self-hosted install.
  const { deploymentMode } = useSystemInfo();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);

  const handleNavClick = () => {
    if (isMobile) toggleSidebar();
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b px-3 py-3.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
        <Link
          href="/dashboard"
          aria-label="LLM Panel — go to dashboard"
          className="flex items-center gap-2.5 overflow-hidden rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-sidebar-border shadow-xs">
            <img
              src="/logo/llmpanel_logo_small.png"
              alt=""
              aria-hidden
              draggable={false}
              className="size-5 select-none object-contain"
            />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold leading-none tracking-tight text-sidebar-accent-foreground">
              LLM{" "}
              <span className="font-medium text-sidebar-foreground/65">
                Panel
              </span>
            </span>
            <span className="truncate text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-sidebar-foreground/50">
              Deployment Platform
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <WorkspaceSwitcher />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/55">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items
                  .filter((item) => !item.cloudOnly || deploymentMode === "cloud")
                  .map((item) => (
                    <NavItem
                      key={item.href}
                      item={item}
                      isActive={isActive(item.href)}
                      onClick={handleNavClick}
                    />
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/55">
            Support
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {supportItems.map((item) => (
                <SupportItem key={item.href} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="p-2">
        <UserFooter />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
