"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Deployment } from "@/hooks/use-deployments"

/** Settings-style row: label left, value right. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-[14px]">{label}</span>
      <span className="min-w-0 truncate text-right text-[14px] text-muted-foreground">{children}</span>
    </div>
  )
}

interface SettingsGeneralCardProps {
  deployment: Deployment
  deploymentId: string
}

export function SettingsGeneralCard({
  deployment,
  deploymentId,
}: SettingsGeneralCardProps) {
  const [name, setName] = useState(deployment.model?.name ?? deployment.huggingfaceId)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    name.trim() !== (deployment.model?.name ?? deployment.huggingfaceId) && name.trim() !== ""

  const handleRename = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setIsSaving(true)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deploymentId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }
      )
      if (!res.ok) throw new Error("Failed to rename deployment")
      toast.success("Deployment renamed")
      setIsEditing(false)
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to rename deployment"
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
      {/* Name — inline edit in place; Return saves, Escape cancels. */}
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <label htmlFor="deployment-name" className="shrink-0 text-[14px]">Name</label>
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <Input
              id="deployment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Llama"
              className="h-8 max-w-xs rounded-[9px] border-0 bg-muted text-[14px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/30"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && isDirty) void handleRename()
                if (e.key === "Escape") {
                  setName(deployment.model?.name ?? deployment.huggingfaceId)
                  setIsEditing(false)
                }
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-[13px]"
              onClick={() => {
                setName(deployment.model?.name ?? deployment.huggingfaceId)
                setIsEditing(false)
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRename()}
              disabled={!isDirty || isSaving}
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.96]"
            >
              {isSaving && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex min-w-0 items-center gap-2 text-[14px] text-muted-foreground transition-opacity active:opacity-60"
          >
            <span className="truncate">{name}</span>
            <span className="shrink-0 text-primary">Edit</span>
          </button>
        )}
      </div>

      <Row label="Model">
        <code className="font-mono text-[13px]">{deployment.model?.slug ?? deployment.huggingfaceId}</code>
      </Row>
      <Row label="GPU">{deployment.gpuType}</Row>
      <Row label="Quantization">
        <span className="font-mono uppercase">{deployment.quantization}</span>
      </Row>
      <Row label="Engine">{deployment.inferenceEngine.toUpperCase()}</Row>
      <Row label="Created">
        <span className="tabular-nums">
          {new Date(deployment.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </Row>
    </div>
  )
}
