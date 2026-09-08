"use client"

import { use, useState } from "react"
import { Bell, Loader2, AlertCircle, RefreshCw, BellOff } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { useAlertChannels, useAlertRules } from "@/hooks/use-alerts"
import type { AlertChannel, AlertRule } from "@/hooks/use-alerts"
import { AddChannelDialog } from "@/components/alerts/add-channel-dialog"
import { AddRuleDialog } from "@/components/alerts/add-rule-dialog"
import { ChannelCard } from "@/components/alerts/channel-card"
import { AlertRuleRow } from "@/components/alerts/alert-rule-row"

// ── Empty state placeholders ─────────────────────────────────────────────────

function Empty({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <Icon className="mb-1 size-6 text-muted-foreground/40" strokeWidth={1.75} />
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      <p className="max-w-xs text-[13px] text-muted-foreground">{body}</p>
    </div>
  )
}

function ChannelsEmptyState() {
  return <Empty icon={Bell} title="No channels yet" body="Add Telegram, Discord, or Slack to start receiving alerts." />
}

function RulesEmptyState({ hasChannels }: { hasChannels: boolean }) {
  return (
    <Empty
      icon={BellOff}
      title="No alert rules"
      body={hasChannels ? "Create a rule to get notified about deployment events." : "Add a notification channel first, then create rules here."}
    />
  )
}

/** Inset-grouped section with a sentence-case title and an action on the right. */
function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="space-y-1.5"
    >
      <div className="flex items-end justify-between gap-3 px-3">
        <div>
          <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>
          {hint && <p className="text-[12px] text-muted-foreground/70">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}

const EVENTS = [
  { dot: "bg-primary", label: "deployment.started", desc: "Provisioning begins" },
  { dot: "bg-success", label: "deployment.running", desc: "Model is live" },
  { dot: "bg-destructive", label: "deployment.failed", desc: "An error occurred" },
  { dot: "bg-muted-foreground", label: "deployment.stopped", desc: "Manually stopped" },
]

// ── Main page ────────────────────────────────────────────────────────────────

export default function DeploymentAlertsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: deploymentId } = use(params)

  const {
    channels,
    isLoading: channelsLoading,
    error: channelsError,
    refetch: refetchChannels,
  } = useAlertChannels()

  const {
    rules,
    isLoading: rulesLoading,
    error: rulesError,
    refetch: refetchRules,
  } = useAlertRules(deploymentId)

  const handleChannelCreated = (channel: AlertChannel) => {
    void refetchChannels()
  }

  const handleChannelDeleted = () => {
    void refetchChannels()
    void refetchRules()
  }

  const handleRuleCreated = (rule: AlertRule) => {
    void refetchRules()
  }

  const handleRuleDeleted = () => void refetchRules()
  const handleRuleUpdated = () => void refetchRules()

  const isLoading = channelsLoading || rulesLoading
  const hasError = channelsError || rulesError

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading alerts...</p>
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">
          {channelsError ?? rulesError ?? "Failed to load alerts"}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { void refetchChannels(); void refetchRules() }}
          className="gap-1.5 rounded-full"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      <header className="px-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Alerts</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Where notifications go, and which deployment events send them.
        </p>
      </header>

      {/* ── Notification channels ── */}
      <Group
        title="Notification channels"
        hint="Shared across all your deployments."
        action={<AddChannelDialog onCreated={handleChannelCreated} />}
      >
        {channels.length === 0 ? (
          <ChannelsEmptyState />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {channels.map((ch) => (
              <li key={ch.id}>
                <ChannelCard channel={ch} onDeleted={handleChannelDeleted} />
              </li>
            ))}
          </ul>
        )}
      </Group>

      {/* ── Alert rules ── */}
      <Group
        title="Alert rules"
        hint="Events that notify a channel for this deployment."
        action={<AddRuleDialog deploymentId={deploymentId} channels={channels} onCreated={handleRuleCreated} />}
      >
        {rules.length === 0 ? (
          <RulesEmptyState hasChannels={channels.length > 0} />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {rules.map((rule) => (
              <li key={rule.id}>
                <AlertRuleRow
                  rule={rule}
                  deploymentId={deploymentId}
                  onDeleted={handleRuleDeleted}
                  onUpdated={handleRuleUpdated}
                />
              </li>
            ))}
          </ul>
        )}
      </Group>

      {/* ── Event reference ── */}
      {rules.length > 0 && (
        <Group title="Events">
          <ul className="grid grid-cols-1 divide-y divide-black/[0.05] sm:grid-cols-2 sm:divide-x dark:divide-white/[0.06] [&>li:nth-child(-n+2)]:sm:border-t-0">
            {EVENTS.map((ev) => (
              <li key={ev.label} className="flex items-center gap-3 px-5 py-3">
                <span className={`size-2 shrink-0 rounded-full ${ev.dot}`} />
                <div className="min-w-0">
                  <code className="font-mono text-[12px]">{ev.label}</code>
                  <p className="text-[12px] text-muted-foreground">{ev.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
    </MotionConfig>
  )
}
