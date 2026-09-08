"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, ChevronUp, WifiOff, Terminal } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface LogsPanelProps {
  lines: string[]
  isConnected: boolean
  hasExternalId: boolean
}

export function LogsPanel({
  lines,
  isConnected,
  hasExternalId,
}: LogsPanelProps) {
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [lines, autoScroll])

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-500/10">
              <Terminal className="size-4 text-zinc-500" />
            </div>
            <CardTitle className="text-sm">Container Logs</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {isConnected ? (
              <Badge
                variant="success"
                className="gap-1.5 text-[10px] px-2 py-0.5"
              >
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                </span>
                Live
              </Badge>
            ) : (
              hasExternalId && (
                <Badge
                  variant="secondary"
                  className="gap-1.5 text-[10px] px-2 py-0.5"
                >
                  <WifiOff className="size-3" />
                  Disconnected
                </Badge>
              )
            )}
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition-colors"
            >
              {autoScroll ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronUp className="size-3" />
              )}
              Auto-scroll {autoScroll ? "on" : "off"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-72 overflow-y-auto bg-zinc-950 rounded-b-xl font-mono text-xs text-zinc-300 px-5 py-4 space-y-px border-t border-zinc-800">
          {!hasExternalId ? (
            <p className="text-zinc-500 italic">
              Waiting for container to start...
            </p>
          ) : lines.length === 0 ? (
            <p className="text-zinc-500 italic">
              {isConnected
                ? "Waiting for log output..."
                : "Connecting to log stream..."}
            </p>
          ) : (
            lines.map((line, i) => (
              <p
                key={i}
                className="leading-relaxed whitespace-pre-wrap break-all hover:bg-white/[0.03] px-1 -mx-1 rounded transition-colors"
              >
                <span className="text-zinc-600 select-none mr-3 inline-block w-8 text-right tabular-nums">
                  {i + 1}
                </span>
                {line}
              </p>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </CardContent>
    </Card>
  )
}
