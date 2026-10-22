"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { IN_PROGRESS_STATUSES, statusLabel } from "./status-badge"
import { cn } from "@/lib/utils"
import type { Deployment } from "@/hooks/use-deployments"
import { engineLabel } from "@/lib/inference-engine"

/**
 * Fixed-height flex column so every card in the grid is identical and the
 * loading skeleton matches exactly — no cumulative layout shift. All variable
 * content (progress / endpoint / error / idle) lives inside a single `flex-1`
 * status slot that absorbs the difference, so the outer height never changes.
 *
 * Kept deliberately quiet: one surface, one hairline, one status colour. The
 * dot in the header is the *only* place status is expressed in colour — the
 * card border, the background and the type all stay neutral so a grid of
 * twenty deployments doesn't read as a christmas tree.
 */
const CARD_HEIGHT = "h-[11.5rem]"

/** iOS sheet curve — decisive out, soft settle. */
const EASE = "[transition-timing-function:cubic-bezier(0.32,0.72,0,1)]"

function toneFor(status: string) {
  if (status === "running") return "text-success"
  if (status === "failed") return "text-destructive"
  if (status === "stopped") return "text-muted-foreground/60"
  return "text-primary"
}

function StatusDot({ status }: { status: string }) {
  const animated = IN_PROGRESS_STATUSES.has(status)
  return (
    <span className={cn("relative flex size-1.5 shrink-0", toneFor(status))}>
      {animated && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
      )}
      <span className="relative inline-flex size-1.5 rounded-full bg-current" />
    </span>
  )
}

function StatusSlot({ deployment }: { deployment: Deployment }) {
  const { status } = deployment
  const inProgress = IN_PROGRESS_STATUSES.has(status)

  // Provisioning / downloading / loading → the message *is* the content, with a
  // hairline track underneath. No panel, no icon — the number carries it.
  if (inProgress && deployment.progress != null) {
    return (
      <div className="w-full space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[12.5px] leading-snug text-foreground/75">
            {deployment.statusMessage ?? "Working…"}
          </span>
          <span className="shrink-0 font-mono text-[12.5px] font-medium tabular-nums text-foreground">
            {deployment.progress}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={deployment.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[3px] overflow-hidden rounded-full bg-border"
        >
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width] duration-700 motion-reduce:transition-none",
              EASE
            )}
            style={{ width: `${deployment.progress}%` }}
          />
        </div>
      </div>
    )
  }

  if (status === "failed" && deployment.errorMessage) {
    return (
      <p className="line-clamp-3 border-l-2 border-destructive/35 pl-3 text-[12.5px] leading-relaxed text-destructive/90">
        {deployment.errorMessage}
      </p>
    )
  }

  if (status === "running" && deployment.endpoint) {
    return (
      <p className="truncate font-mono text-[12.5px] leading-snug text-foreground/80">
        {deployment.endpoint}
      </p>
    )
  }

  // Everything else — prefer the user's own description over a canned line.
  const fallback =
    deployment.description?.trim() ||
    (status === "stopped"
      ? "Endpoint offline"
      : status === "running"
        ? "Endpoint provisioning…"
        : (deployment.statusMessage ?? "Waiting to start"))

  return (
    <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
      {fallback}
    </p>
  )
}

export function DeploymentCard({ deployment }: { deployment: Deployment }) {
  const modelName = deployment.model?.name ?? null

  // Prefer the user-given project name; fall back to the model name, then HF id.
  const title = deployment.name ?? modelName ?? deployment.huggingfaceId
  // Subtitle shows the model when the title is a custom name; otherwise the HF id.
  const subtitle = deployment.name
    ? (modelName ?? deployment.huggingfaceId)
    : deployment.huggingfaceId

  const age =
    deployment.runningFor ??
    new Date(deployment.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })

  return (
    <Link
      href={`/dashboard/deployments/${deployment.id}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-xl border-border/60 px-5 py-0",
          CARD_HEIGHT,
          "transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none",
          EASE,
          "group-hover:-translate-y-px group-hover:border-border group-hover:shadow-[0_10px_28px_-16px_oklch(0_0_0/0.35)]",
          "group-active:translate-y-0 group-active:scale-[0.995] group-active:duration-75",
          "motion-reduce:group-hover:translate-y-0 motion-reduce:group-active:scale-100"
        )}
      >
        {/* Header — name, model id, and the single status affordance */}
        <div className="flex shrink-0 items-start justify-between gap-3 pt-5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold leading-tight tracking-[-0.011em] text-foreground">
              {title}
            </h3>
            <p className="mt-1 truncate font-mono text-[11px] leading-snug text-muted-foreground">
              {subtitle}
            </p>
          </div>
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-[11px] leading-none">
            <StatusDot status={deployment.status} />
            <span
              className={cn(
                "font-medium",
                deployment.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {statusLabel(deployment.status)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="whitespace-nowrap tabular-nums text-muted-foreground/70">
              {age}
            </span>
          </span>
        </div>

        {/* Status slot — flex-1 absorbs all height variance (no CLS) */}
        <div className="flex min-h-0 flex-1 items-center py-4">
          <div className="w-full">
            <StatusSlot deployment={deployment} />
          </div>
        </div>

        {/* Spec line — inset hairline, technical values in mono */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/60 py-3.5 font-mono text-[11px] leading-none">
          <span className="flex min-w-0 items-center gap-1.5 text-foreground/65">
            <span className="truncate">{deployment.gpuType}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="shrink-0 uppercase">{deployment.quantization}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="shrink-0 uppercase">{engineLabel(deployment.inferenceEngine)}</span>
          </span>
          {deployment.costPerHour != null && (
            <span className="shrink-0 tabular-nums text-foreground/65">
              ${deployment.costPerHour.toFixed(2)}/hr
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}
