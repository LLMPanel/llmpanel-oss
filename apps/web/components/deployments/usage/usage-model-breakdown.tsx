"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ModelUsageBreakdown } from "@/hooks/use-deployment-usage"
import { formatCompact, formatExact, formatLatency } from "./format"

export function UsageModelBreakdown({ models }: { models: ModelUsageBreakdown[] }) {
  const totalRequests = models.reduce((s, m) => s + m.requests, 0)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-3 pt-4">
        <CardTitle className="text-sm font-medium">Models</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        {models.length === 0 ? (
          <div className="flex h-[208px] items-center justify-center text-sm text-muted-foreground">
            No model usage in this period
          </div>
        ) : (
          <div className="max-h-[208px] space-y-4 overflow-y-auto pr-1">
            {models.map((m) => {
              const share = totalRequests > 0 ? (m.requests / totalRequests) * 100 : 0
              return (
                <div key={m.model} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-mono text-xs font-medium" title={m.model}>
                      {m.model}
                    </p>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatExact(m.requests)}
                      </span>{" "}
                      req · {share.toFixed(1)}%
                    </p>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(share, 1)}%` }}
                    />
                  </div>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {formatCompact(m.totalTokens)} tokens · {formatLatency(m.avgLatencyMs)} avg
                    {m.errors > 0 && (
                      <span className="text-destructive">
                        {" "}
                        · {formatExact(m.errors)} errors
                      </span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
