"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Check, Cloud, Database, ExternalLink, FileText, Info, Loader2, Plus,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useRagCollections, type RagCollection } from "@/hooks/use-rag"
import {
  updateDeploymentAgent,
  type DeploymentAgent,
} from "@/hooks/use-deployment-agents"

// Agents can attach any number of knowledge collections; knowledge_search
// queries all of them and merges results by similarity.
export function AgentKnowledgeTab({
  agent,
  onSaved,
}: {
  agent: DeploymentAgent
  onSaved: () => Promise<void> | void
}) {
  const { collections, isLoading } = useRagCollections(agent.deploymentId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toolBusy, setToolBusy] = useState(false)

  const attachedIds = agent.ragCollectionIds
  const knowledgeEnabled = agent.toolsEnabled.includes("knowledge_search")

  const toggleCollection = async (collection: RagCollection) => {
    const attached = attachedIds.includes(collection.id)
    const nextIds = attached
      ? attachedIds.filter((id) => id !== collection.id)
      : [...attachedIds, collection.id]

    setBusyId(collection.id)
    try {
      // Attaching the first collection also switches the tool on — an
      // attachment without the tool would never be used at runtime.
      const enableTool = !attached && !knowledgeEnabled
      await updateDeploymentAgent(agent.deploymentId, agent.id, {
        ragCollectionIds: nextIds,
        ...(enableTool ? { toolsEnabled: [...agent.toolsEnabled, "knowledge_search" as const] } : {}),
      })
      await onSaved()
      toast.success(
        attached
          ? `Detached ${collection.name}`
          : `Attached ${collection.name}${enableTool ? " (knowledge search enabled)" : ""}`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update knowledge base")
    } finally {
      setBusyId(null)
    }
  }

  const toggleTool = async (enabled: boolean) => {
    setToolBusy(true)
    try {
      await updateDeploymentAgent(agent.deploymentId, agent.id, {
        toolsEnabled: enabled
          ? [...new Set([...agent.toolsEnabled, "knowledge_search" as const])]
          : agent.toolsEnabled.filter((t) => t !== "knowledge_search"),
      })
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update tools")
    } finally {
      setToolBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Knowledge bases</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Attach collections the agent can search. Results from every
              attached collection are merged by similarity.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs shrink-0">
            <Link href={`/dashboard/deployments/${agent.deploymentId}/rag`}>
              Manage collections
              <ExternalLink className="size-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/25 px-4 py-10 text-center">
              <Database className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No knowledge collections on this deployment yet.
              </p>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/dashboard/deployments/${agent.deploymentId}/rag`}>
                  <Plus className="size-3.5" />
                  Create a collection
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {collections.map((c) => {
                const attached = attachedIds.includes(c.id)
                const busy = busyId === c.id
                const isQdrant = c.vectorStoreType === "qdrant"
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                      attached
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        isQdrant ? "bg-blue-500/10" : "bg-violet-500/10"
                      )}
                    >
                      {isQdrant ? (
                        <Cloud className="size-4 text-blue-500" />
                      ) : (
                        <Database className="size-4 text-violet-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <Badge
                          variant={isQdrant ? "blue" : "purple"}
                          className="shrink-0 px-1.5 py-0 text-[9px]"
                        >
                          {isQdrant ? "Qdrant" : "zvec"}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.documentCount} doc{c.documentCount === 1 ? "" : "s"} · {c.totalChunks} chunks
                        · top {c.topK} · ≥{c.scoreThreshold}
                        {c.description ? ` · ${c.description}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={attached ? "outline" : "default"}
                      disabled={busy}
                      onClick={() => void toggleCollection(c)}
                      className="h-7 shrink-0 gap-1.5 text-xs"
                    >
                      {busy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : attached ? (
                        <Check className="size-3" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                      {attached ? "Attached" : "Attach"}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {attachedIds.length > 1 && (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <p>
                {attachedIds.length} collections attached — knowledge_search
                queries all of them and returns the best matches overall.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Knowledge search tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Enable knowledge_search tool</p>
              <p className="text-sm text-muted-foreground">
                Let the agent decide when to search its attached knowledge bases.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {toolBusy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              <Switch
                checked={knowledgeEnabled}
                onCheckedChange={(v) => void toggleTool(v)}
                disabled={toolBusy}
              />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>
              When enabled, the agent can search its knowledge bases during a
              conversation (models must support tool calling). Retrieval uses
              each collection&apos;s top-K and score threshold.
            </p>
          </div>
          {knowledgeEnabled && attachedIds.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <FileText className="mt-0.5 size-3.5 shrink-0" />
              <p>Attach at least one knowledge base above so the tool has something to search.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
