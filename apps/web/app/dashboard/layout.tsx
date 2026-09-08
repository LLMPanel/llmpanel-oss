"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "@/components/sidebar/dashboard-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const sectionTitles: Record<string, string> = {
  "/dashboard": "Projects",
  "/dashboard/instances": "Instances",
  "/dashboard/models": "Models",
  "/dashboard/providers": "Providers",
  "/dashboard/settings": "Settings",
  "/dashboard/alerts": "Alerts",
  "/dashboard/users": "Users",
  "/dashboard/members": "Members",
  "/dashboard/spendings": "Spendings",
};

function pageTitle(pathname: string): string {
  if (sectionTitles[pathname]) return sectionTitles[pathname];
  const match = Object.keys(sectionTitles)
    .filter((p) => p !== "/dashboard" && pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? sectionTitles[match] : "Dashboard";
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (
    pathname.startsWith("/dashboard/deployments") ||
    pathname.startsWith("/dashboard/chat")
  ) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2.5 border-b bg-background/80 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <Separator orientation="vertical" className="!h-4" />
          <h1 className="text-[13px] font-medium">{pageTitle(pathname)}</h1>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
