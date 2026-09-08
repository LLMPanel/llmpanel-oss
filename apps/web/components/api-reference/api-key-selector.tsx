"use client"

import { KeyRound } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ApiKey } from "@/hooks/use-api-keys"

export const PLACEHOLDER_KEY = "YOUR_API_KEY"

interface ApiKeySelectorProps {
  apiKeys: ApiKey[]
  selectedKeyId: string | null
  onSelect: (id: string | null) => void
}

export function ApiKeySelector({ apiKeys, selectedKeyId, onSelect }: ApiKeySelectorProps) {
  const activeKeys = apiKeys.filter((k) => k.isActive)
  const selected = activeKeys.find((k) => k.id === selectedKeyId) ?? null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        <KeyRound className="size-3.5 shrink-0" />
        <span>Key for examples</span>
      </div>

      {activeKeys.length === 0 ? (
        <span className="rounded-full bg-warning/10 px-3 py-1 text-[12px] text-warning">
          No active keys — create one in API Keys
        </span>
      ) : (
        <Select
          value={selectedKeyId ?? "none"}
          onValueChange={(v) => onSelect(v === "none" ? null : v)}
        >
          <SelectTrigger className="h-8 w-60 gap-2 rounded-[9px] border-0 bg-muted text-[12px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/30">
            <SelectValue placeholder="Select key for curl examples" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs text-muted-foreground">
              Placeholder
            </SelectItem>
            {activeKeys.map((key) => (
              <SelectItem key={key.id} value={key.id} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{key.name}</span>
                  <code className="text-[10px] text-muted-foreground">{key.prefix}</code>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selected && (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          <code className="font-mono">{selected.prefix}</code>
        </span>
      )}
    </div>
  )
}
