"use client"

import { use } from "react"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { useDeployment } from "@/hooks/use-deployments"
import { SettingsGeneralCard } from "@/components/deployments/settings-general-card"
import { SettingsLifecycleCard } from "@/components/deployments/settings-lifecycle-card"
import { SettingsDangerCard } from "@/components/deployments/settings-danger-card"

export default function DeploymentSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { deployment, isLoading, error, refetch } = useDeployment(id)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  if (error || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">
          {error ?? "Deployment not found"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          className="gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  const deploymentName = deployment.model?.name ?? deployment.huggingfaceId

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      <header className="px-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Settings</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Configuration and lifecycle for this deployment.
        </p>
      </header>

      <Group title="Lifecycle" hint="Pause to stop GPU billing, resume or restart anytime." index={0}>
        <SettingsLifecycleCard deployment={deployment} deploymentId={id} onChanged={() => refetch()} />
      </Group>

      <Group title="General" index={1}>
        <SettingsGeneralCard deployment={deployment} deploymentId={id} />
      </Group>

      <Group title="Danger zone" tone="destructive" index={2}>
        <SettingsDangerCard
          deployment={deployment}
          deploymentId={id}
          deploymentName={deploymentName}
          onChanged={() => refetch()}
        />
      </Group>
    </div>
    </MotionConfig>
  )
}

/** Inset-grouped section, Settings.app style. */
function Group({
  title,
  hint,
  tone,
  index,
  children,
}: {
  title: string
  hint?: string
  tone?: "destructive"
  index: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.04 }}
      className="space-y-1.5"
    >
      <div className="px-3">
        <h2 className={`text-[12px] font-medium ${tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[12px] text-muted-foreground/70">{hint}</p>}
      </div>
      <div
        className={`overflow-hidden rounded-2xl bg-card ring-1 ${
          tone === "destructive" ? "ring-destructive/20" : "ring-black/[0.06] dark:ring-white/[0.06]"
        }`}
      >
        {children}
      </div>
    </motion.section>
  )
}
