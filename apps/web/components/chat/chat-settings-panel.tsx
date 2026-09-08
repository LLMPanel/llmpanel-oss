"use client"

import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DEFAULT_SETTINGS, type ChatSettings } from "@/lib/chat"

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2.5 px-3 py-3">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="cursor-help text-[13px] font-medium">{label}</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px]">{hint}</TooltipContent>
        </Tooltip>
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

interface ChatSettingsPanelProps {
  settings: ChatSettings
  onChange: (patch: Partial<ChatSettings>) => void
  /** Sampling params can't change mid-stream; disable while generating. */
  disabled?: boolean
  locked?: boolean
}

export function ChatSettingsPanel({
  settings,
  onChange,
  disabled,
  locked,
}: ChatSettingsPanelProps) {
  return (
    <div className="flex flex-col gap-5 p-3">
      {/* System prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-3">
          <Label className="text-[12px] font-medium text-muted-foreground">System prompt</Label>
          {settings.systemPrompt && (
            <button
              className="text-[12px] text-primary transition-opacity active:opacity-60"
              onClick={() => onChange({ systemPrompt: "" })}
              disabled={locked}
            >
              Clear
            </button>
          )}
        </div>
        <Textarea
          value={settings.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant…"
          disabled={locked}
          className="min-h-[90px] resize-y rounded-xl border-0 bg-muted/50 px-3 py-2.5 text-[13px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-muted/30"
        />
        <p className="px-3 text-[11px] text-muted-foreground">
          Sent as the first message on every turn in this chat.
        </p>
      </div>

      {/* Sampling */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-3">
          <span className="text-[12px] font-medium text-muted-foreground">
            Sampling
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    temperature: DEFAULT_SETTINGS.temperature,
                    maxTokens: DEFAULT_SETTINGS.maxTokens,
                    topP: DEFAULT_SETTINGS.topP,
                  })
                }
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to defaults</TooltipContent>
          </Tooltip>
        </div>

        <div className="divide-y divide-black/[0.05] rounded-xl bg-muted/50 dark:divide-white/[0.06] dark:bg-muted/30">
        <SliderRow
          label="Temperature"
          hint="Higher values make output more random and creative; lower values make it more focused and deterministic."
          value={settings.temperature}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          disabled={disabled}
          onChange={(v) => onChange({ temperature: v })}
        />
        <SliderRow
          label="Max tokens"
          hint="Upper bound on the number of tokens the model may generate in a single reply."
          value={settings.maxTokens}
          min={64}
          max={8192}
          step={64}
          disabled={disabled}
          onChange={(v) => onChange({ maxTokens: v })}
        />
        <SliderRow
          label="Top P"
          hint="Nucleus sampling: the model considers only the smallest set of tokens whose probabilities add up to this value."
          value={settings.topP}
          min={0.05}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          disabled={disabled}
          onChange={(v) => onChange({ topP: v })}
        />
        </div>
      </div>

      {disabled && (
        <p className="px-3 text-[11px] text-muted-foreground">
          Sampling parameters are locked while the model is responding.
        </p>
      )}
    </div>
  )
}
