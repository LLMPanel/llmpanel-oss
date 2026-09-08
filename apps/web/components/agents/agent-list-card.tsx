"use client"

import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ChevronRight, Sparkles } from "lucide-react"
import { AgentSourceBadge } from "@/components/agents/agent-source-badge"
import { AgentAvatar, agentModelLabel, relativeTime } from "@/components/agents/agent-shared"
import type { Deployment } from "@/hooks/use-deployments"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"

export function AgentListCard({
  agent,
  deployments,
  index = 0,
}: {
  agent: DeploymentAgent
  deployments: Deployment[]
  index?: number
}) {
  const router = useRouter()
  const href = `/dashboard/deployments/${agent.deploymentId}/agents/${agent.id}`
  const model = agentModelLabel(agent, deployments)
  const toolsCount = agent.toolsEnabled.length

  return (
    <motion.button
      type="button"
      onClick={() => router.push(href)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4, delay: Math.min(index, 8) * 0.03 }}
      className="group flex w-full flex-col gap-4 rounded-2xl bg-card p-5 text-left ring-1 ring-black/[0.06] transition-[transform,box-shadow] duration-150 ease-out hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:ring-white/[0.06] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
    >
      <div className="flex items-start gap-3.5">
        <AgentAvatar emoji={agent.emoji} className="size-12 rounded-[14px] text-2xl" iconClassName="size-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">{agent.name}</h3>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground">
            {agent.description || "No description yet."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
        <AgentSourceBadge sourceType={agent.sourceType} />
        <span className="truncate font-medium text-foreground/80">{model}</span>
        {toolsCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
            <Sparkles className="size-3" />
            {toolsCount} tool{toolsCount === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto tabular-nums">{relativeTime(agent.createdAt)}</span>
      </div>
    </motion.button>
  )
}
