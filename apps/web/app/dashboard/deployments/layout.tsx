import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar"
import { DeploymentSidebar } from "@/components/sidebar/deployment-sidebar";

export default function DeploymentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <DeploymentSidebar />
      <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </SidebarProvider>
  );
}
