"use client"

import { use, useState } from "react"
import { AlertTriangle, BarChart3, ChartPie, Download, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PageHeader } from "@/components/deployments/page-header"
import { UsageKpiRow } from "@/components/deployments/usage/usage-kpis"
import {
  UsageErrorsChart,
  UsageLatencyChart,
  UsageRequestsChart,
  UsageTokensChart,
} from "@/components/deployments/usage/usage-charts"
import { UsageModelBreakdown } from "@/components/deployments/usage/usage-model-breakdown"
import { UsageApiKeysTable } from "@/components/deployments/usage/usage-api-keys-table"
import { UsageImageStats } from "@/components/deployments/usage/usage-image-stats"
import { useApiKeys } from "@/hooks/use-api-keys"
import { useDeployment } from "@/hooks/use-deployments"
import {
  useDeploymentUsage,
  type DeploymentUsage,
  type UsagePeriod,
} from "@/hooks/use-deployment-usage"

const AUTO_REFRESH_MS = 30_000

const PERIOD_OPTIONS: { value: UsagePeriod; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
]

function downloadSeriesCsv(usage: DeploymentUsage, deploymentId: string) {
  const header = [
    "bucket_start_utc",
    "requests",
    "successful",
    "client_errors",
    "server_errors",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "avg_latency_ms",
  ]
  const rows = usage.series.map((p) =>
    [
      p.bucket,
      p.requests,
      p.successful,
      p.clientErrors,
      p.serverErrors,
      p.promptTokens,
      p.completionTokens,
      p.totalTokens,
      p.avgLatencyMs,
    ].join(","),
  )
  const blob = new Blob([[header.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `usage-${deploymentId}-${usage.period}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function UsagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [period, setPeriod] = useState<UsagePeriod>("7d")
  const [apiKeyId, setApiKeyId] = useState<string | undefined>(undefined)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const { deployment } = useDeployment(id)
  const isImageModel = deployment?.modelType === "image-generation"

  const { apiKeys } = useApiKeys()
  const deploymentApiKeys = apiKeys.filter(
    (k) => k.isActive && (!k.deploymentId || k.deploymentId === id),
  )

  const { data, isLoading, isRefreshing, error, updatedAt, refetch } = useDeploymentUsage(
    id,
    period,
    apiKeyId,
    { refreshIntervalMs: autoRefresh ? AUTO_REFRESH_MS : undefined },
  )

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Usage"
          description="Request volume, tokens, errors, and latency for this deployment."
          icon={ChartPie}
          actions={
            <>
              <Select
                value={apiKeyId ?? "all"}
                onValueChange={(v) => setApiKeyId(v === "all" ? undefined : v)}
              >
                <SelectTrigger className="h-8 w-[170px] text-sm">
                  <SelectValue placeholder="All API keys" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All API keys</SelectItem>
                  {deploymentApiKeys.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={period} onValueChange={(v) => setPeriod(v as UsagePeriod)}>
                <SelectTrigger className="h-8 w-[150px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.series.length === 0}
                onClick={() => data && downloadSeriesCsv(data, id)}
              >
                <Download className="size-3.5" />
                Export
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => void refetch()}
                    disabled={isLoading || isRefreshing}
                    aria-label="Refresh"
                  >
                    <RefreshCw className={isRefreshing ? "size-3.5 animate-spin" : "size-3.5"} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {updatedAt
                    ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                    : "Refresh"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 pl-1">
                    <Switch
                      id="usage-auto-refresh"
                      checked={autoRefresh}
                      onCheckedChange={setAutoRefresh}
                    />
                    <Label
                      htmlFor="usage-auto-refresh"
                      className="text-xs text-muted-foreground"
                    >
                      Auto
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Refresh every 30 seconds</TooltipContent>
              </Tooltip>
            </>
          }
        />

        {error && !data ? (
          <ErrorState message={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-4">
            <UsageKpiRow totals={data.totals} previous={data.previousTotals} period={period} />

            {/* Image deployments: generation stats from image_generations (covers playground + API). */}
            {isImageModel && <UsageImageStats deploymentId={id} period={period} />}

            {data.totals.totalRequests === 0 ? (
              <NoTrafficState filtered={Boolean(apiKeyId)} />
            ) : (
              <>
                <UsageRequestsChart data={data.series} bucket={data.bucket} />

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Token charts are meaningless for diffusion models. */}
                  {!isImageModel && <UsageTokensChart data={data.series} bucket={data.bucket} />}
                  <UsageLatencyChart data={data.series} bucket={data.bucket} />
                  {isImageModel && <UsageErrorsChart data={data.series} bucket={data.bucket} />}
                </div>

                {!isImageModel && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <UsageErrorsChart data={data.series} bucket={data.bucket} />
                    <UsageModelBreakdown models={data.byModel} />
                  </div>
                )}

                <UsageApiKeysTable keys={data.byApiKey} />
              </>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border py-16 text-center">
      <AlertTriangle className="size-5 text-destructive" />
      <p className="mt-3 text-sm font-medium">Couldn&apos;t load usage data</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function NoTrafficState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
        <BarChart3 className="size-5 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-medium">No requests in this period</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "The selected API key has no traffic in this period. Try a different key or a longer period."
          : "Requests sent to this deployment's endpoint will appear here."}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-0 py-0">
            <CardContent className="space-y-2 px-4 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-3 pt-4">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          <Skeleton className="h-[240px] w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="gap-0 py-0">
            <CardHeader className="px-5 pb-3 pt-4">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0">
              <Skeleton className="h-[240px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
