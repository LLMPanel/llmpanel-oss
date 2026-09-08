"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogBody,
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
  createDeploymentAgent,
  type AgentSourceType,
  type CreateDeploymentAgentInput,
} from "@/hooks/use-deployment-agents"

// Borderless muted field — the same treatment as the chat composer.
const FIELD = "rounded-xl border-0 bg-muted shadow-none focus-visible:ring-2 focus-visible:ring-ring/30"

export function AgentQuickCreateDialog({
  open,
  onOpenChange,
  deployment,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  deployment: Deployment
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("")
  const [sourceType, setSourceType] = useState<AgentSourceType>("deployment")
  const [externalBaseUrl, setExternalBaseUrl] = useState<string>(EXTERNAL_PROVIDER_PRESETS[0].value)
  const [externalModel, setExternalModel] = useState("")
  const [externalApiKey, setExternalApiKey] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const presetValue = EXTERNAL_PROVIDER_PRESETS.some((p) => p.value === externalBaseUrl)
    ? externalBaseUrl
    : "custom"

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (sourceType === "deployment") return true
    return Boolean(externalBaseUrl.trim() && externalModel.trim() && externalApiKey.trim())
  }, [name, sourceType, externalBaseUrl, externalModel, externalApiKey])

  const reset = () => {
    setName("")
    setEmoji("")
    setSourceType("deployment")
    setExternalBaseUrl(EXTERNAL_PROVIDER_PRESETS[0].value)
    setExternalModel("")
    setExternalApiKey("")
  }

  const submit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const body: CreateDeploymentAgentInput = {
        name: name.trim(),
        emoji: emoji.trim() || undefined,
        sourceType,
        targetDeploymentId: sourceType === "deployment" ? deployment.id : undefined,
        externalBaseUrl: sourceType === "openai-compatible" ? externalBaseUrl.trim() : undefined,
        externalModel: sourceType === "openai-compatible" ? externalModel.trim() : undefined,
        externalApiKey: sourceType === "openai-compatible" ? externalApiKey.trim() : undefined,
      }
      const agent = await createDeploymentAgent(deployment.id, body)
      toast.success(`Created ${agent.name}`)
      onOpenChange(false)
      reset()
      router.push(`/dashboard/deployments/${deployment.id}/agents/${agent.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create agent")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[20px] tracking-[-0.02em]">New Agent</DialogTitle>
          <DialogDescription>
            Runs on this deployment&apos;s model by default. You can refine everything after.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[70vh] space-y-5">
          <div className="flex items-center gap-3">
            <Input
              id="quick-emoji"
              aria-label="Emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🤖"
              className={FIELD + " size-12 shrink-0 px-0 text-center text-2xl"}
              maxLength={4}
            />
            <Input
              id="quick-name"
              aria-label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Support Agent"
              className={FIELD + " h-12 text-[15px]"}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="px-1 text-[12px] font-medium text-muted-foreground">Model</Label>
            <SegmentedControl<AgentSourceType>
              label="Model source"
              value={sourceType}
              options={[
                { value: "deployment", label: "This deployment" },
                { value: "openai-compatible", label: "OpenAI‑compatible" },
              ]}
              onChange={setSourceType}
              className="w-full [&>button]:flex-1"
            />
            <p className="px-1 text-[11px] text-muted-foreground">
              {sourceType === "deployment"
                ? `Runs on ${deployment.model?.name ?? deployment.huggingfaceId}.`
                : "Any provider that speaks the OpenAI chat API."}
            </p>
          </div>

          <AnimatePresence initial={false} mode="wait">
          {sourceType === "deployment" ? (
            deployment.status !== "running" ? (
              <motion.p
                key="not-running"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="overflow-hidden rounded-xl bg-warning/10 px-4 py-3 text-[13px] leading-[1.45] text-warning"
              >
                This deployment isn&apos;t running yet — the agent will start responding once{" "}
                {deployment.model?.name ?? deployment.huggingfaceId} is up.
              </motion.p>
            ) : null
          ) : (
            <motion.div
              key="external"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="px-1 text-[12px] font-medium text-muted-foreground">Provider</Label>
                  <Select
                    value={presetValue}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setExternalBaseUrl("")
                        return
                      }
                      setExternalBaseUrl(v)
                    }}
                  >
                    <SelectTrigger className={FIELD}>
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
                  <Label className="px-1 text-[12px] font-medium text-muted-foreground" htmlFor="quick-model">Model ID</Label>
                  <Input
                    id="quick-model"
                    value={externalModel}
                    onChange={(e) => setExternalModel(e.target.value)}
                    placeholder="gpt-4.1-mini"
                    className={FIELD}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="px-1 text-[12px] font-medium text-muted-foreground" htmlFor="quick-base-url">Base URL</Label>
                <Input
                  id="quick-base-url"
                  value={externalBaseUrl}
                  onChange={(e) => setExternalBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={FIELD}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="px-1 text-[12px] font-medium text-muted-foreground" htmlFor="quick-key">API key</Label>
                <Input
                  id="quick-key"
                  type="password"
                  value={externalApiKey}
                  onChange={(e) => setExternalApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={FIELD}
                />
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-full active:scale-[0.96]"
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || isSubmitting} className="gap-2 rounded-full px-5 active:scale-[0.96]">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Create agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
