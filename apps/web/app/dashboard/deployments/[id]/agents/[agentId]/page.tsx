"use client"

import { use, useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { AgentSourceBadge } from "@/components/agents/agent-source-badge"
import { AgentAvatar } from "@/components/agents/agent-shared"
import { AgentOverviewTab } from "@/components/agents/agent-overview-tab"
import { AgentConfigTab } from "@/components/agents/agent-config-tab"
import { AgentKnowledgeTab } from "@/components/agents/agent-knowledge-tab"
import { AgentKeysTab } from "@/components/agents/agent-keys-tab"
import { AgentCodeTab } from "@/components/agents/agent-code-tab"
import { AgentTestTab } from "@/components/agents/agent-test-tab"
import { useDeployment, useDeployments } from "@/hooks/use-deployments"
import { useDeploymentAgent } from "@/hooks/use-deployment-agents"

type AgentTab = "overview" | "configuration" | "knowledge" | "keys" | "code" | "test"

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "configuration", label: "Configuration" },
  { value: "knowledge", label: "Knowledge" },
  { value: "keys", label: "API Keys" },
  { value: "code", label: "Code" },
  { value: "test", label: "Test" },
] as const satisfies readonly { value: AgentTab; label: string }[]

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string; agentId: string }>
}) {
  const { id, agentId } = use(params)
  const listHref = `/dashboard/deployments/${id}/agents`
  const [tab, setTab] = useState<AgentTab>("overview")

  const { agent, isLoading, error, refetch } = useDeploymentAgent(id, agentId)
  const { deployment, isLoading: deploymentLoading } = useDeployment(id)
  const { deployments } = useDeployments()

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin

  if (isLoading || deploymentLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading agent...</p>
      </div>
    )
  }

  if (error || !agent || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">{error ?? "Agent not found"}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={listHref}>Back to agents</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 px-1 text-[14px] text-primary transition-opacity active:opacity-60"
      >
        <ArrowLeft className="size-4" strokeWidth={2.25} />
        Agents
      </Link>

      <header className="flex items-start gap-4 px-1">
        <AgentAvatar emoji={agent.emoji} className="size-16 rounded-[18px] text-[34px]" iconClassName="size-7" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">{agent.name}</h1>
            <AgentSourceBadge sourceType={agent.sourceType} />
          </div>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            {agent.description || "No description yet."}
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-20 -mx-2 px-2">
        <div className="overflow-x-auto rounded-2xl bg-background/70 py-1 backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-background">
          <SegmentedControl label="Section" value={tab} options={TABS} onChange={setTab} />
        </div>
        <div aria-hidden className="pointer-events-none h-4 bg-gradient-to-b from-background to-transparent" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        >
          {tab === "overview" && <AgentOverviewTab agent={agent} deployments={deployments} baseUrl={baseUrl} />}
          {tab === "configuration" && <AgentConfigTab agent={agent} deployment={deployment} onSaved={refetch} />}
          {tab === "knowledge" && <AgentKnowledgeTab agent={agent} onSaved={refetch} />}
          {tab === "keys" && <AgentKeysTab agent={agent} />}
          {tab === "code" && <AgentCodeTab agent={agent} baseUrl={baseUrl} />}
          {tab === "test" && <AgentTestTab agent={agent} />}
        </motion.div>
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}
