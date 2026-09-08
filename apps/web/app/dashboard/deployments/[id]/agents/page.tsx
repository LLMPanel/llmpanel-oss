"use client"

import { use, useState } from "react"
import { AlertCircle, BotMessageSquare, Loader2, Plus, RefreshCw } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { AgentListCard } from "@/components/agents/agent-list-card"
import { AgentQuickCreateDialog } from "@/components/agents/agent-quick-create-dialog"
import { useDeployment, useDeployments } from "@/hooks/use-deployments"
import { useDeploymentAgents } from "@/hooks/use-deployment-agents"

export default function DeploymentAgentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const {
    deployment,
    isLoading: deploymentLoading,
    error: deploymentError,
    refetch: refetchDeployment,
  } = useDeployment(id)
  const { deployments } = useDeployments()
  const { agents, isLoading, error } = useDeploymentAgents(id)

  const [createOpen, setCreateOpen] = useState(false)

  if (deploymentLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading agents workspace...</p>
      </div>
    )
  }

  if (deploymentError || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">{deploymentError ?? "Deployment not found"}</p>
        <Button variant="outline" size="sm" onClick={() => void refetchDeployment()} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Agents</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Focused assistants on this deployment, each with its own endpoint and keys.
          </p>
        </div>
        {agents.length > 0 && (
          <PillButton onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" strokeWidth={2.5} />
            New Agent
          </PillButton>
        )}
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl bg-card py-16 ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          Failed to load agents: {error}
        </div>
      ) : agents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="flex flex-col items-center px-6 py-20 text-center"
        >
          <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
            <BotMessageSquare className="size-6 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">Build your first agent</h3>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-[1.45] text-muted-foreground">
            A Support Agent, an Email Agent, a Research Agent — each with its own system prompt,
            knowledge, and key‑protected endpoint.
          </p>
          <PillButton className="mt-6" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" strokeWidth={2.5} />
            Create Agent
          </PillButton>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {agents.map((agent, i) => (
            <AgentListCard key={agent.id} agent={agent} deployments={deployments} index={i} />
          ))}
        </div>
      )}

      <AgentQuickCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        deployment={deployment}
      />
    </div>
    </MotionConfig>
  )
}

function PillButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[transform,opacity] duration-100 ease-out hover:opacity-90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${className ?? ""}`}
    >
      {children}
    </button>
  )
}
