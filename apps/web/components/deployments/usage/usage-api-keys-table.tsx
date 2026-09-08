"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ApiKeyUsageBreakdown } from "@/hooks/use-deployment-usage"
import { formatCompact, formatExact, formatLatency } from "./format"

function keyLabel(k: ApiKeyUsageBreakdown): { name: string; detail: string | null } {
  if (!k.apiKeyId) return { name: "Unattributed", detail: "requests without an API key" }
  if (!k.name) return { name: "Deleted key", detail: k.apiKeyId }
  return { name: k.name, detail: k.prefix }
}

export function UsageApiKeysTable({ keys }: { keys: ApiKeyUsageBreakdown[] }) {
  const totalRequests = keys.reduce((s, k) => s + k.requests, 0)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-3 pt-4">
        <CardTitle className="text-sm font-medium">API keys</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3 pt-0">
        {keys.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No API key activity in this period
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Key</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
                <TableHead className="pr-3 text-right">Traffic share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => {
                const { name, detail } = keyLabel(k)
                const share = totalRequests > 0 ? (k.requests / totalRequests) * 100 : 0
                const errorRate = k.requests > 0 ? (k.errors / k.requests) * 100 : 0
                return (
                  <TableRow key={k.apiKeyId ?? "unattributed"}>
                    <TableCell className="pl-3">
                      <p className="text-sm font-medium">{name}</p>
                      {detail && (
                        <p className="font-mono text-xs text-muted-foreground">{detail}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatExact(k.requests)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.errors > 0 ? (
                        <span className="text-destructive">
                          {formatExact(k.errors)}
                          <span className="text-xs"> ({errorRate.toFixed(1)}%)</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(k.totalTokens)}
                      <span className="block text-xs text-muted-foreground">
                        {formatCompact(k.promptTokens)} in · {formatCompact(k.completionTokens)} out
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLatency(k.avgLatencyMs)}
                    </TableCell>
                    <TableCell className="pr-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(share, 1)}%` }}
                          />
                        </div>
                        <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
