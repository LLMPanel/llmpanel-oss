"use client";

import { useRef } from "react";
import type React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Bell,
  Database,
  Github,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Radio,
  ScrollText,
  Send,
  Settings,
  PieChart,
  Webhook,
  BookOpen,
} from "lucide-react";
import {
  ArrowUpLeftIcon,
  type ArrowUpLeftIconHandle,
} from "@/components/ui/arrow-up-left";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutPanelTopIcon } from "../ui/layout-panel-top";
import { KeyIcon } from "../ui/key";
import { ActivityIcon } from "../ui/activity";
import { FileTextIcon } from "../ui/file-text";
import { ChartPieIcon } from "../ui/chart-pie";
import { BotMessageSquareIcon } from "../ui/bot-message-square";
import { MessageSquareIcon } from "../ui/message-square";
import { RadioIcon } from "../ui/radio";
import { MessageCircleIcon } from "../ui/message-circle";
import { WaypointsIcon } from "../ui/waypoints";
import { WebhookIcon } from "../ui/webhook";
import { BellIcon } from "../ui/bell";
import { SettingsIcon } from "../ui/settings";
import { useDeployment } from "@/hooks/use-deployments";
import { SIDEBAR_NAV_ITEM_CLASS } from "@/components/sidebar/nav-item-class";

interface NavSection {
  label: string;
  items: {
    title: string;
    href: string;
    icon: React.ElementType;
    exact?: boolean;
    /** Optional pill rendered next to the title, e.g. "Beta" or "New". */
    badge?: string;
  }[];
}

function useNavSections(): NavSection[] {
  const pathname = usePathname();
  // pathname: /dashboard/deployments/[id]/...
  // segments: ['', 'dashboard', 'deployments', '<id>', ...]
  const deploymentId = pathname.split("/")[3] ?? "";
  const base = `/dashboard/deployments/${deploymentId}`;

  const { deployment } = useDeployment(deploymentId);
  const isImageModel = deployment?.modelType === "image-generation";

  // Image deployments swap the LLM Chat playground for the image Generate page.
  const interactItems = isImageModel
    ? [{ title: "Generate", href: `${base}/generate`, icon: ImageIcon }]
    : [
        { title: "Chat", href: `${base}/chat`, icon: MessageSquareIcon },
        {
          title: "Agents",
          href: `${base}/agents`,
          icon: BotMessageSquareIcon,
          badge: "Beta",
        },
        {
          title: "Channels",
          href: `${base}/channels`,
          icon: RadioIcon,
          badge: "Beta",
        },
        {
          title: "RAG",
          href: `${base}/rag`,
          icon: MessageCircleIcon,
          badge: "Beta",
        },
      ];

  return [
    {
      label: "Observe",
      items: [
        {
          title: "Overview",
          href: base,
          icon: LayoutPanelTopIcon,
          exact: true,
        },
        { title: "Metrics", href: `${base}/metrics`, icon: ChartPieIcon },
        { title: "Usage", href: `${base}/usage`, icon: ActivityIcon },
        { title: "Request Logs", href: `${base}/logs`, icon: FileTextIcon },
        {
          title: "Container Logs",
          href: `${base}/containerlogs`,
          icon: ScrollText,
        },
      ],
    },
    {
      label: "Interact",
      items: interactItems,
    },
    {
      label: "Configure",
      items: [
        { title: "API Keys", href: `${base}/api-keys`, icon: KeyIcon },
        { title: "API Reference", href: `${base}/api`, icon: WaypointsIcon },
        {
          title: "Hooks",
          href: `${base}/hooks`,
          icon: WebhookIcon,
          badge: "Beta",
        },
        { title: "Alerts", href: `${base}/alerts`, icon: BellIcon },
        { title: "Backups", href: `${base}/backups`, icon: Database },
        { title: "Settings", href: `${base}/settings`, icon: SettingsIcon },
      ],
    },
  ];
}

const supportItems = [
  {
    title: "Discord",
    href: "https://discord.gg/llmpanel",
    icon: MessageSquare,
    external: true,
  },
  {
    title: "Telegram",
    href: "https://t.me/llmpanel",
    icon: Send,
    external: true,
  },
  {
    title: "Email",
    href: "mailto:support@llmpanel.io",
    icon: Mail,
    external: true,
  },
  {
    title: "GitHub",
    href: "https://github.com/llmpanel-dev/llmpanel",
    icon: Github,
    external: true,
  },
];

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

function NavItemWithAnimation({
  item,
  Icon,
  isActive,
  onClick,
}: {
  item: NavItem;
  Icon: React.ElementType;
  isActive: boolean;
  onClick: () => void;
}) {
  const iconRef = useRef<{
    startAnimation: () => void;
    stopAnimation: () => void;
  }>(null);

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
          <span className="truncate">{item.title}</span>
          {item.badge ? (
            <span className="ml-auto shrink-0 rounded-full border border-sidebar-primary/25 bg-sidebar-primary/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em] text-sidebar-primary group-data-[collapsible=icon]:hidden">
              {item.badge}
            </span>
          ) : null}
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
      <SidebarMenuButton asChild tooltip={item.title}>
        <a href={item.href} target="_blank" rel="noopener noreferrer">
          <Icon />
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function DeploymentSidebar() {
  const pathname = usePathname();
  const sections = useNavSections();
  const { isMobile, toggleSidebar } = useSidebar();

  const handleNavClick = () => {
    if (isMobile) toggleSidebar();
  };

  return (
    <Sidebar>
      <SidebarHeader className="gap-2 border-b px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">LLMPanel</span>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm" tooltip="Back to dashboard">
              <Link href="/dashboard" prefetch={true} onClick={handleNavClick}>
                <ArrowUpLeftIcon size={16} />
                <span>Back to dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/55">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                  return (
                    <NavItemWithAnimation
                      key={item.href}
                      item={item}
                      Icon={Icon}
                      isActive={isActive}
                      onClick={handleNavClick}
                    />
                  );
                })}
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

      <SidebarFooter />
    </Sidebar>
  );
}
