"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import { SegmentedControl } from "@/components/ui/segmented-control"
import { ChatMetricsPanel } from "@/components/chat/chat-metrics-panel"
import { ChatSettingsPanel } from "@/components/chat/chat-settings-panel"
import type { ChatSettings } from "@/lib/chat"

type Pane = "settings" | "metrics"

const PANES = [
  { value: "settings", label: "Settings" },
  { value: "metrics", label: "Metrics" },
] as const satisfies readonly { value: Pane; label: string }[]

interface ChatRightPanelProps {
  settings: ChatSettings
  onSettingsChange: (patch: Partial<ChatSettings>) => void
  isStreaming: boolean
  deploymentId: string | null
  isRunning: boolean
  modelFamily?: string | null
  contextTokens: number
}

export function ChatRightPanel({
  settings,
  onSettingsChange,
  isStreaming,
  deploymentId,
  isRunning,
  modelFamily,
  contextTokens,
}: ChatRightPanelProps) {
  const [pane, setPane] = useState<Pane>("settings")

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <SegmentedControl
          label="Panel"
          value={pane}
          options={PANES}
          onChange={setPane}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pane}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {pane === "settings" ? (
              <ChatSettingsPanel settings={settings} onChange={onSettingsChange} disabled={isStreaming} />
            ) : (
              <ChatMetricsPanel
                deploymentId={deploymentId}
                isRunning={isRunning}
                modelFamily={modelFamily}
                contextTokens={contextTokens}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
