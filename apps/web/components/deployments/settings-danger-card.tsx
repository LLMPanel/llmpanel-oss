"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import type { Deployment } from "@/hooks/use-deployments"

interface SettingsDangerCardProps {
  deployment: Deployment
  deploymentId: string
  deploymentName: string
  onChanged: () => void | Promise<void>
}

export function SettingsDangerCard({
  deployment,
  deploymentId,
  deploymentName,
  onChanged,
}: SettingsDangerCardProps) {
  const [terminateOpen, setTerminateOpen] = useState(false)

  // Matches the API guard: a pod exists to destroy unless the deployment is
  // already settled with no externalId.
  const hasPod =
    !!deployment.externalId ||
    !["stopped", "failed"].includes(deployment.status)

  const handleTerminate = async () => {
    const res = await globalThis.fetch(`/api/v1/deployments/${deploymentId}`, {
      method: "DELETE",
      credentials: "include",
    })
    const data = (await res.json().catch(() => null)) as
      | { error?: string }
      | null
    if (!res.ok) {
      const message = data?.error ?? "Failed to terminate pod"
      toast.error(message)
      throw new Error(message)
    }
    toast.success("Pod terminated — all provider billing stopped")
    await onChanged()
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">Terminate pod</p>
          <p className="mt-0.5 max-w-md text-[12px] leading-[1.45] text-muted-foreground">
            {hasPod
              ? "Destroys the GPU pod on the provider — compute and disk billing stop. The deployment and its API keys are kept, so you can redeploy anytime."
              : "No pod is currently allocated — nothing to terminate."}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.96]"
          onClick={() => setTerminateOpen(true)}
          disabled={!hasPod}
        >
          Terminate…
        </Button>
      </div>

      <TerminateDialog
        open={terminateOpen}
        deploymentName={deploymentName}
        onConfirm={handleTerminate}
        onCancel={() => setTerminateOpen(false)}
      />
    </>
  )
}

function TerminateDialog({
  open,
  deploymentName,
  onConfirm,
  onCancel,
}: {
  open: boolean
  deploymentName: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [confirmText, setConfirmText] = useState("")
  const [isTerminating, setIsTerminating] = useState(false)
  const REQUIRED = "terminate"

  const handle = async () => {
    if (confirmText !== REQUIRED) return
    setIsTerminating(true)
    try {
      await onConfirm()
      setConfirmText("")
      onCancel()
    } catch {
      // error already surfaced via toast
    } finally {
      setIsTerminating(false)
    }
  }

  const reset = () => setConfirmText("")

  const warnings = [
    <>
      The GPU pod for{" "}
      <span className="font-medium text-foreground">{deploymentName}</span>{" "}
      is destroyed on the provider
    </>,
    "The endpoint goes offline and in-flight requests are dropped",
    "All compute and disk billing for this pod stops",
    <>
      The deployment record and API keys are{" "}
      <span className="font-medium text-foreground">kept</span> — you can
      redeploy on a fresh pod later
    </>,
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[20px] tracking-[-0.02em]">Terminate this pod?</DialogTitle>
          <DialogDescription>The pod is destroyed — the deployment record stays.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-3 pb-1">
          <ul className="divide-y divide-black/[0.05] rounded-xl bg-muted/50 dark:divide-white/[0.06] dark:bg-muted/30">
            {warnings.map((text, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2.5 text-[13px] leading-[1.45] text-muted-foreground">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-destructive" />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-terminate" className="px-1 text-[12px] font-medium text-muted-foreground">
              Type <code className="font-mono text-foreground">terminate</code> to confirm
            </Label>
            <Input
              id="confirm-terminate"
              placeholder="terminate"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="h-10 rounded-xl border-0 bg-muted font-mono shadow-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmText === REQUIRED) void handle()
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => {
              reset()
              onCancel()
            }}
            disabled={isTerminating}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handle()}
            disabled={confirmText !== REQUIRED || isTerminating}
            className="gap-1.5 rounded-full px-4"
          >
            {isTerminating && <Loader2 className="size-3.5 animate-spin" />}
            Terminate Pod
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
