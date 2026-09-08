"use client"

import { useState } from "react"
import Link from "next/link"
import {
  BotMessageSquare, Check, ExternalLink, Loader2, Plus, Wrench,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { RagCollection } from "@/hooks/use-rag"
import {
  useDeploymentAgents,
  updateDeploymentAgent,
  type DeploymentAgent,
} from "@/hooks/use-deployment-agents"

// The collection side of the agent↔knowledge link: connect any agent on this
// deployment to the selected collection without leaving the RAG page.
export function CollectionAgents({
  collection,
  deploymentId,
  onChanged,
}: {
  collection: RagCollection
  deploymentId: string
  onChanged: () => void
}) {
  const { agents, isLoading, refetch } = useDeploymentAgents(deploymentId)
  const [busyId, setBusyId] = useState<string | null>(null)

  const toggle = async (agent: DeploymentAgent) => {
    const connected = agent.ragCollectionIds.includes(collection.id)
    const nextIds = connected
      ? agent.ragCollectionIds.filter((id) => id !== collection.id)
      : [...agent.ragCollectionIds, collection.id]

    setBusyId(agent.id)
    try {
      // Attaching a first collection without the tool enabled would do
      // nothing at runtime — switch the tool on in the same call.
      const enableTool =
        !connected && !agent.toolsEnabled.includes("knowledge_search")
      await updateDeploymentAgent(deploymentId, agent.id, {
        ragCollectionIds: nextIds,
        ...(enableTool ? { toolsEnabled: [...agent.toolsEnabled, "knowledge_search" as const] } : {}),
      })
      toast.success(
        connected
          ? `Disconnected ${agent.name}`
          : `Connected ${agent.name}${enableTool ? " (knowledge search enabled)" : ""}`
      )
      await refetch()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update agent")
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center mt-2">
        <BotMessageSquare className="size-7 text-muted-foreground/40" />
        <p className="max-w-sm text-xs text-muted-foreground">
          No agents on this deployment yet. Create one and it can search this
          knowledge base with the <code className="text-[10px]">knowledge_search</code> tool.
        </p>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/dashboard/deployments/${deploymentId}/agents`}>
            <Plus className="size-3.5" />
            Create an agent
          </Link>
        </Button>
      </div>
    )
  }

  const connectedCount = agents.filter((a) =>
    a.ragCollectionIds.includes(collection.id)
  ).length

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {connectedCount} of {agents.length} agent{agents.length === 1 ? "" : "s"} connected
        </p>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Link href={`/dashboard/deployments/${deploymentId}/agents`}>
            Manage agents
            <ExternalLink className="size-3" />
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {agents.map((agent) => {
          const connected = agent.ragCollectionIds.includes(collection.id)
          const busy = busyId === agent.id
          const toolOn = agent.toolsEnabled.includes("knowledge_search")

          return (
            <div
              key={agent.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                connected ? "border-primary/50 bg-primary/[0.03]" : "hover:bg-muted/30"
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-base">
                {agent.emoji || <BotMessageSquare className="size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/deployments/${deploymentId}/agents/${agent.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {agent.name}
                  </Link>
                  {connected && toolOn && (
                    <Badge variant="success" className="gap-1 px-1.5 py-0 text-[9px]">
                      <Wrench className="size-2.5" />
                      knowledge_search
                    </Badge>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {agent.ragCollectionIds.length === 0
                    ? "No knowledge bases attached"
                    : `${agent.ragCollectionIds.length} knowledge base${agent.ragCollectionIds.length === 1 ? "" : "s"} attached`}
                  {agent.description ? ` · ${agent.description}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant={connected ? "outline" : "default"}
                disabled={busy}
                onClick={() => void toggle(agent)}
                className="h-7 shrink-0 gap-1.5 text-xs"
              >
                {busy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : connected ? (
                  <Check className="size-3" />
                ) : (
                  <Plus className="size-3" />
                )}
                {connected ? "Connected" : "Connect"}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
