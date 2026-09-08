"use client"

import { use, useState } from "react"
import {
  Radio,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { useChannels, type Channel, type ChannelPlatform } from "@/hooks/use-channels"
import { useDeploymentAgents } from "@/hooks/use-deployment-agents"
import { ConnectChannelWizard } from "@/components/channels/connect-channel-dialog"
import { ChannelCard } from "@/components/channels/channel-card"
import {
  ChannelPlatformIcon,
  channelPlatformLabel,
  isStubPlatform,
} from "@/components/channels/platform-icon"

const GALLERY_PLATFORMS: ChannelPlatform[] = [
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "feishu",
  "twitch",
  "zalo",
]

function PlatformGallery({
  onPick,
}: {
  onPick: (platform: ChannelPlatform) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="flex flex-col items-center gap-6 px-6 py-16 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Radio className="size-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">No channels yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-[1.45] text-muted-foreground">
          Connect a messaging platform so people can talk to your model or agent
          from the apps they already use.
        </p>
      </div>
      {/* App-grid of platforms — tap one to start the wizard on it. */}
      <div className="grid w-full max-w-lg grid-cols-4 gap-3 sm:grid-cols-7">
        {GALLERY_PLATFORMS.map((p, i) => {
          const isStub = isStubPlatform(p)
          return (
            <motion.button
              key={p}
              type="button"
              disabled={isStub}
              onClick={() => onPick(p)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4, delay: 0.08 + i * 0.03 }}
              className={[
                "flex flex-col items-center gap-1.5 rounded-2xl py-2 text-[11px] font-medium",
                "transition-[transform,background-color] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isStub
                  ? "cursor-not-allowed opacity-40"
                  : "hover:bg-muted/60 active:scale-[0.94]",
              ].join(" ")}
            >
              <span className="flex size-12 items-center justify-center rounded-[14px] bg-card text-foreground ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
                <ChannelPlatformIcon platform={p} className="size-5" />
              </span>
              <span className="leading-none">{channelPlatformLabel(p)}</span>
              {isStub && <span className="-mt-0.5 text-[10px] font-normal leading-none text-muted-foreground">Soon</span>}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

export default function DeploymentChannelsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: deploymentId } = use(params)

  const { channels, isLoading, error, refetch } = useChannels(deploymentId, {
    pollMs: 15_000,
  })
  const { agents } = useDeploymentAgents(deploymentId)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [pickedPlatform, setPickedPlatform] = useState<ChannelPlatform | null>(null)

  const handleCreated = (_channel: Channel) => {
    setPickedPlatform(null)
    void refetch()
  }

  const openWithPlatform = (platform: ChannelPlatform) => {
    setPickedPlatform(platform)
    setWizardOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading channels...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          className="gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  const activeChannels = channels.filter((ch) => ch.isActive)

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Channels</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Let people chat with your model or agent from messaging platforms.
          </p>
        </div>
        <ConnectChannelWizard
          deploymentId={deploymentId}
          agents={agents}
          onCreated={handleCreated}
          initialPlatform={pickedPlatform}
          open={wizardOpen}
          onOpenChange={(v) => {
            setWizardOpen(v)
            if (!v) setPickedPlatform(null)
          }}
        />
      </header>

      {activeChannels.length === 0 ? (
        <PlatformGallery onPick={openWithPlatform} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {activeChannels.map((ch, i) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              deploymentId={deploymentId}
              onChanged={() => void refetch()}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
    </MotionConfig>
  )
}
