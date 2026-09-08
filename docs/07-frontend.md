# 07 — Frontend (Next.js)

## hooks/use-deploy-model.ts

```typescript
import { useState } from "react"
import { toast } from "sonner"

interface DeployInput {
  modelId: string
  providerId: string
  gpuType: string
  quantization: "fp16" | "int8" | "int4" | "gguf"
  inferenceEngine: "vllm" | "sglang"
}

export function useDeployModel() {
  const [isDeploying, setIsDeploying] = useState(false)

  const deployModel = async (input: DeployInput): Promise<string | null> => {
    setIsDeploying(true)
    try {
      const compat = await fetch(
        `/api/v1/models/${input.modelId}/compatibility?gpuType=${input.gpuType}&quantization=${input.quantization}`
      ).then(r => r.json())

      if (!compat.compatible) {
        toast.error(`Not enough VRAM. Need ${compat.estimatedVramGb}GB, have ${compat.availableVramGb}GB`)
        return null
      }
      if (compat.warning) toast.warning(compat.warning)

      const res = await fetch("/api/v1/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Deployment failed")
      }

      const { deployment } = await res.json()
      toast.success("Deployment started!")
      return deployment.id
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deploy")
      return null
    } finally {
      setIsDeploying(false)
    }
  }

  return { deployModel, isDeploying }
}
```

## hooks/use-deployment-status.ts

```typescript
import { useEffect, useState } from "react"
import { toast } from "sonner"

type Status = "provisioning" | "downloading" | "loading" | "health_check" | "running" | "stopped" | "failed"

interface DeploymentStatus {
  status: Status
  progress: number
  message: string
  endpoint: string | null
}

export function useDeploymentStatus(deploymentId: string | null) {
  const [data, setData] = useState<DeploymentStatus>({
    status: "provisioning",
    progress: 0,
    message: "Starting...",
    endpoint: null,
  })

  useEffect(() => {
    if (!deploymentId) return
    const sse = new EventSource(`/api/v1/deployments/${deploymentId}/status`)

    sse.onmessage = (event) => {
      const update: DeploymentStatus = JSON.parse(event.data)
      setData(update)
      if (update.status === "running") { toast.success("Model is live!"); sse.close() }
      if (update.status === "failed") { toast.error("Deployment failed"); sse.close() }
    }

    sse.onerror = () => sse.close()
    return () => sse.close()
  }, [deploymentId])

  return data
}
```

## hooks/use-deployments.ts

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useDeployments(filters?: { status?: string }) {
  const params = new URLSearchParams(filters as any).toString()
  return useQuery({
    queryKey: ["deployments", filters],
    queryFn: () => fetch(`/api/v1/deployments?${params}`).then(r => r.json()),
    refetchInterval: 10000, // refetch every 10s
  })
}

export function useDeployment(id: string) {
  return useQuery({
    queryKey: ["deployments", id],
    queryFn: () => fetch(`/api/v1/deployments/${id}`).then(r => r.json()),
  })
}

export function useStopDeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/deployments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments"] }),
  })
}
```

## hooks/use-models.ts

```typescript
import { useQuery } from "@tanstack/react-query"

export function useModels(filters?: { family?: string; tag?: string }) {
  const params = new URLSearchParams(filters as any).toString()
  return useQuery({
    queryKey: ["models", filters],
    queryFn: () => fetch(`/api/v1/models?${params}`).then(r => r.json()),
  })
}

export function useModel(id: string) {
  return useQuery({
    queryKey: ["models", id],
    queryFn: () => fetch(`/api/v1/models/${id}`).then(r => r.json()),
  })
}
```

## components/deployments/deployment-progress.tsx

```typescript
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react"
import { useDeploymentStatus } from "@/hooks/use-deployment-status"

const STAGES = [
  { key: "provisioning", label: "Setting up infrastructure" },
  { key: "downloading",  label: "Downloading model weights" },
  { key: "loading",      label: "Loading into GPU memory" },
  { key: "health_check", label: "Running health check" },
  { key: "running",      label: "Live" },
] as const

const STAGE_ORDER = STAGES.map(s => s.key)

export function DeploymentProgress({ deploymentId }: { deploymentId: string }) {
  const { status, progress, message, endpoint } = useDeploymentStatus(deploymentId)
  const currentIndex = STAGE_ORDER.indexOf(status as any)

  return (
    <div className="space-y-4 p-6 border rounded-lg">
      <p className="text-sm text-muted-foreground">{message}</p>

      {status === "downloading" && (
        <div className="w-full bg-secondary rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="space-y-3">
        {STAGES.map((stage, index) => {
          const isDone = currentIndex > index
          const isCurrent = currentIndex === index
          const isPending = currentIndex < index
          return (
            <div key={stage.key} className="flex items-center gap-3">
              {isDone    && <CheckCircle className="h-5 w-5 text-green-500" />}
              {isCurrent && status !== "failed" && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
              {isCurrent && status === "failed"  && <XCircle className="h-5 w-5 text-destructive" />}
              {isPending  && <Circle className="h-5 w-5 text-muted-foreground" />}
              <span className={isPending ? "text-muted-foreground" : ""}>{stage.label}</span>
            </div>
          )
        })}
      </div>

      {status === "running" && endpoint && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="font-medium text-green-800">✅ Model is Live!</p>
          <p className="text-sm font-mono mt-1 text-green-700">{endpoint}</p>
        </div>
      )}

      {status === "failed" && (
        <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
          <p className="font-medium text-red-800">❌ Deployment Failed</p>
          <p className="text-sm text-red-700 mt-1">Check the logs for details.</p>
        </div>
      )}
    </div>
  )
}
```

## TanStack Query Provider setup

```typescript
// apps/web/app/layout.tsx
"use client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </body>
    </html>
  )
}
```
