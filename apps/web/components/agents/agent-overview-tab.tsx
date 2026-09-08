"use client"

import { useMemo } from "react"
import { Activity, AlertTriangle, Clock, Gauge, Hash } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CopyButton, agentModelLabel, relativeTime } from "@/components/agents/agent-shared"
import type { Deployment } from "@/hooks/use-deployments"
import { useAgentUsage, type DeploymentAgent } from "@/hooks/use-deployment-agents"

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  )
}

export function AgentOverviewTab({
  agent,
  deployments,
  baseUrl,
}: {
  agent: DeploymentAgent
  deployments: Deployment[]
  baseUrl: string
}) {
  const { usage, isLoading } = useAgentUsage(agent.deploymentId, agent.id)
  const endpoint = useMemo(() => `${baseUrl}${agent.endpointPath}`, [baseUrl, agent.endpointPath])

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Requests"
          value={isLoading ? "…" : fmt(usage?.totalRequests)}
          hint="last 7 days"
        />
        <StatCard
          icon={Hash}
          label="Tokens"
          value={isLoading ? "…" : fmt(usage?.totalTokens)}
          hint="last 7 days"
        />
        <StatCard
          icon={Gauge}
          label="Avg latency"
          value={isLoading ? "…" : `${fmt(usage?.avgLatencyMs)} ms`}
          hint="last 7 days"
        />
        <StatCard
          icon={AlertTriangle}
          label="Errors"
          value={isLoading ? "…" : fmt(usage?.errorCount)}
          hint="last 7 days"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2">
            <code className="min-w-0 flex-1 break-all text-xs">{endpoint}</code>
            <CopyButton text={endpoint} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">OpenAI Chat-Compatible</Badge>
            <Badge variant="success">Bearer key auth</Badge>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              Last used {relativeTime(usage?.lastRequestAt ?? null)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <SummaryRow label="Source">
            {agent.sourceType === "deployment" ? "Local deployment" : "OpenAI-compatible"}
          </SummaryRow>
          <SummaryRow label="Model">{agentModelLabel(agent, deployments)}</SummaryRow>
          {agent.sourceType === "openai-compatible" ? (
            <SummaryRow label="Base URL">{agent.externalBaseUrl ?? "—"}</SummaryRow>
          ) : null}
          <SummaryRow label="Temperature">
            {agent.temperature == null ? "Default" : agent.temperature}
          </SummaryRow>
          <SummaryRow label="Max tokens">{agent.maxTokens == null ? "Default" : agent.maxTokens}</SummaryRow>
          <SummaryRow label="Max steps">{agent.maxSteps}</SummaryRow>
          <SummaryRow label="Knowledge search">
            {agent.toolsEnabled.includes("knowledge_search") ? (
              <Badge variant="teal">Enabled</Badge>
            ) : (
              <span className="text-muted-foreground">Off</span>
            )}
          </SummaryRow>
        </CardContent>
      </Card>
    </div>
  )
}
