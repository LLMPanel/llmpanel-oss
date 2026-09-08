"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EXTERNAL_PROVIDER_PRESETS } from "@/components/agents/agent-shared"
import type { Deployment } from "@/hooks/use-deployments"
import {
  deleteDeploymentAgent,
  updateDeploymentAgent,
  type AgentSourceType,
  type DeploymentAgent,
  type UpdateDeploymentAgentInput,
} from "@/hooks/use-deployment-agents"

type FormState = {
  name: string
  emoji: string
  description: string
  systemPrompt: string
  sourceType: AgentSourceType
  externalBaseUrl: string
  externalModel: string
  externalApiKey: string
  temperature: string
  maxTokens: string
  maxSteps: string
}

function toForm(agent: DeploymentAgent): FormState {
  return {
    name: agent.name,
    emoji: agent.emoji ?? "",
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    sourceType: agent.sourceType,
    externalBaseUrl: agent.externalBaseUrl ?? EXTERNAL_PROVIDER_PRESETS[0].value,
    externalModel: agent.externalModel ?? "",
    externalApiKey: "",
    temperature: agent.temperature == null ? "" : String(agent.temperature),
    maxTokens: agent.maxTokens == null ? "" : String(agent.maxTokens),
    maxSteps: String(agent.maxSteps),
  }
}

export function AgentConfigTab({
  agent,
  deployment,
  onSaved,
}: {
  agent: DeploymentAgent
  deployment: Deployment
  onSaved: () => Promise<void> | void
}) {
  const router = useRouter()
  const initial = useMemo(() => toForm(agent), [agent])
  const [form, setForm] = useState<FormState>(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const presetValue = EXTERNAL_PROVIDER_PRESETS.some((p) => p.value === form.externalBaseUrl)
    ? form.externalBaseUrl
    : "custom"

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial]
  )

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false
    if (form.sourceType === "openai-compatible") {
      return Boolean(form.externalBaseUrl.trim() && form.externalModel.trim())
    }
    return true
  }, [form])

  const save = async () => {
    if (!canSave || !isDirty) return
    setIsSaving(true)
    try {
      const body: UpdateDeploymentAgentInput = {
        name: form.name.trim(),
        emoji: form.emoji.trim() || undefined,
        description: form.description.trim() || undefined,
        systemPrompt: form.systemPrompt.trim() || undefined,
        sourceType: form.sourceType,
        targetDeploymentId: form.sourceType === "deployment" ? deployment.id : undefined,
        externalBaseUrl:
          form.sourceType === "openai-compatible" ? form.externalBaseUrl.trim() : undefined,
        externalModel:
          form.sourceType === "openai-compatible" ? form.externalModel.trim() : undefined,
        externalApiKey:
          form.sourceType === "openai-compatible" && form.externalApiKey.trim()
            ? form.externalApiKey.trim()
            : undefined,
        temperature: form.temperature.trim() === "" ? null : Number(form.temperature),
        maxTokens: form.maxTokens.trim() === "" ? null : Number(form.maxTokens),
        maxSteps: Number(form.maxSteps) || 1,
      }
      await updateDeploymentAgent(agent.deploymentId, agent.id, body)
      await onSaved()
      toast.success("Agent saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save agent")
    } finally {
      setIsSaving(false)
    }
  }

  const doDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteDeploymentAgent(agent.deploymentId, agent.id)
      toast.success(`Deleted ${agent.name}`)
      router.push(`/dashboard/deployments/${agent.deploymentId}/agents`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete agent")
      setIsDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-emoji">Emoji</Label>
              <Input
                id="cfg-emoji"
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                placeholder="🤖"
                className="text-center text-lg"
                maxLength={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-name">Name</Label>
              <Input
                id="cfg-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Support Agent"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-description">Description</Label>
            <Input
              id="cfg-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Handles customer support questions."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-prompt">System prompt</Label>
            <Textarea
              id="cfg-prompt"
              rows={6}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder="You are a helpful support assistant. Be concise and friendly."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-source">Source type</Label>
            <Select
              value={form.sourceType}
              onValueChange={(v) => set("sourceType", v as AgentSourceType)}
            >
              <SelectTrigger id="cfg-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deployment">
                  This deployment — {deployment.model?.name ?? deployment.huggingfaceId}
                </SelectItem>
                <SelectItem value="openai-compatible">OpenAI-compatible provider</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.sourceType === "deployment" ? (
            deployment.status !== "running" ? (
              <p className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                This deployment isn&apos;t running yet — the agent will start responding once{" "}
                {deployment.model?.name ?? deployment.huggingfaceId} is up.
              </p>
            ) : null
          ) : (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select
                    value={presetValue}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        set("externalBaseUrl", "")
                        return
                      }
                      set("externalBaseUrl", v)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXTERNAL_PROVIDER_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-model">Model ID</Label>
                  <Input
                    id="cfg-model"
                    value={form.externalModel}
                    onChange={(e) => set("externalModel", e.target.value)}
                    placeholder="gpt-4.1-mini"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-base-url">Base URL</Label>
                <Input
                  id="cfg-base-url"
                  value={form.externalBaseUrl}
                  onChange={(e) => set("externalBaseUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-key">API key (leave blank to keep current)</Label>
                <Input
                  id="cfg-key"
                  type="password"
                  value={form.externalApiKey}
                  onChange={(e) => set("externalApiKey", e.target.value)}
                  placeholder="sk-..."
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-temp">Temperature</Label>
            <Input
              id="cfg-temp"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => set("temperature", e.target.value)}
              placeholder="Default"
            />
            <p className="text-xs text-muted-foreground">0–2, blank for default</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-tokens">Max tokens</Label>
            <Input
              id="cfg-max-tokens"
              type="number"
              min={1}
              value={form.maxTokens}
              onChange={(e) => set("maxTokens", e.target.value)}
              placeholder="Default"
            />
            <p className="text-xs text-muted-foreground">Blank for default</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-steps">Max steps</Label>
            <Input
              id="cfg-max-steps"
              type="number"
              min={1}
              max={16}
              value={form.maxSteps}
              onChange={(e) => set("maxSteps", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Tool-use iterations (1–16)</p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <p className="mr-auto text-xs text-muted-foreground">
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </p>
        {isDirty ? (
          <Button variant="ghost" onClick={() => setForm(initial)} disabled={isSaving}>
            Discard
          </Button>
        ) : null}
        <Button onClick={() => void save()} disabled={!canSave || !isDirty || isSaving} className="gap-2">
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Delete this agent</p>
            <p className="text-sm text-muted-foreground">
              Removes the agent, its endpoint, and all its API keys. This cannot be undone.
            </p>
          </div>
          <Button variant="destructive" className="gap-1.5" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            Delete agent
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              Deleting <span className="font-medium text-foreground">{agent.name}</span> is permanent
              and immediately revokes its keys.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doDelete()} disabled={isDeleting} className="gap-2">
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
