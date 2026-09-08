"use client"

import { use } from "react"
import { usePathname } from "next/navigation"
import { Loader2, AlertCircle } from "lucide-react"
import { useDeployment } from "@/hooks/use-deployments"
import { useDeploymentStatus } from "@/hooks/use-deployment-status"
import { DeploymentTopBar } from "@/components/deployments/deployment-top-bar"
import { cn } from "@/lib/utils"

export default function DeploymentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const pathname = usePathname()

  const { deployment, isLoading, error, refetch } = useDeployment(id)
  const sseStatus = useDeploymentStatus(id)

  // Live SSE status overrides stale REST data
  const status = sseStatus.status ?? deployment?.status ?? "provisioning"
  const endpoint = sseStatus.endpoint ?? deployment?.endpoint ?? null

  // Immersive pages fill the area below the top bar with no padding/scroll wrapper
  const immersive =
    pathname.endsWith("/chat") || pathname.endsWith("/containerlogs")

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading deployment...</p>
      </div>
    )
  }

  if (error || !deployment) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">
          {error ?? "Deployment not found"}
        </p>
      </div>
    )
  }

  return (
    <>
      <DeploymentTopBar
        deployment={deployment}
        status={status}
        endpoint={endpoint}
        onRefetch={refetch}
      />
      <div
        className={cn(
          "flex-1 min-h-0",
          immersive ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        {immersive ? (
          <div className="h-full">{children}</div>
        ) : (
          <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>
        )}
      </div>
    </>
  )
}
