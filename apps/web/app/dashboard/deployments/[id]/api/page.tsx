"use client"

import { use, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import { useDeployment } from "@/hooks/use-deployments"
import { useDeploymentStatus } from "@/hooks/use-deployment-status"
import { useApiKeys } from "@/hooks/use-api-keys"
import { ApiKeySelector, PLACEHOLDER_KEY } from "@/components/api-reference/api-key-selector"
import { ApiKeysPanel } from "@/components/api-reference/api-keys-panel"
import { EndpointNav } from "@/components/api-reference/endpoint-nav"
import { EndpointDetail } from "@/components/api-reference/endpoint-detail"
import { endpointsForModelType } from "@/components/api-reference/endpoints-data"
import { SegmentedControl } from "@/components/ui/segmented-control"

type ApiTab = "reference" | "keys"

export default function ApiReferencePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const { deployment, isLoading } = useDeployment(id)
  const sseStatus = useDeploymentStatus(id)
  // Scoped to this deployment: its own keys + global (all-deployment) keys
  const { apiKeys, isLoading: keysLoading, error: keysError, refetch } = useApiKeys(id)

  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(null)
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [tab, setTab] = useState<ApiTab>("reference")

  // Image deployments document the gateway image endpoints instead of the OpenAI/vLLM set.
  const endpoints = endpointsForModelType(deployment?.modelType)
  const endpoint = endpoints.find((e) => e.id === activeEndpointId) ?? endpoints[0]

  // Use live endpoint from SSE, fall back to DB
  const deploymentEndpoint = sseStatus.endpoint ?? deployment?.endpoint ?? null
  const baseUrl = deploymentEndpoint ?? `${typeof window !== "undefined" ? window.location.origin : ""}`
  // Gateway endpoints (API-key auth, logging, hosted images) live on the API
  // origin. The API reports its public URL at runtime — the NEXT_PUBLIC_API_URL
  // fallback is baked at build time and may be an internal Docker hostname.
  const gatewayBase = deployment?.gatewayUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
  // The deployment's own subdomain (https://<domain>) — the clean OpenAI-style
  // base — when wildcard DNS routing is configured.
  const domainBase = deployment?.domainUrl ?? null

  const selectedKey = apiKeys.find((k) => k.id === selectedKeyId)
  // For curl we show the prefix — actual key was shown once on creation
  // We display prefix + "…" as a safe stand-in
  const curlKey = selectedKey ? `${selectedKey.prefix}` : PLACEHOLDER_KEY

  // vLLM serves the model under its HuggingFace id — the gateway forwards it as-is.
  const modelName = deployment?.huggingfaceId ?? deployment?.model?.slug ?? "your-model"
  const activeKeyCount = apiKeys.filter((k) => k.isActive).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const docs =
    deployment?.modelType === "image-generation"
      ? { href: "https://huggingface.co/docs/diffusers/index", label: "diffusers docs" }
      : { href: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html", label: "vLLM docs" }

  const TABS = [
    { value: "reference", label: "Reference" },
    { value: "keys", label: keysLoading ? "API Keys" : `API Keys · ${activeKeyCount}` },
  ] as const satisfies readonly { value: ApiTab; label: string }[]

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">API</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            OpenAI‑compatible endpoints and access keys for this deployment.
          </p>
        </div>
        <a
          href={docs.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] text-primary transition-opacity active:opacity-60"
        >
          {docs.label} <ExternalLink className="size-3.5" />
        </a>
      </header>

      <SegmentedControl<ApiTab> label="Section" value={tab} options={TABS} onChange={setTab} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        >
          {tab === "reference" ? (
            <div className="space-y-5">
              {/* Key selector for code samples — a quiet toolbar, not a boxed form. */}
              <div className="px-1">
                <ApiKeySelector apiKeys={apiKeys} selectedKeyId={selectedKeyId} onSelect={setSelectedKeyId} />
              </div>

              <div className="flex gap-6">
                <aside className="w-56 shrink-0">
                  <div className="sticky top-4 rounded-2xl bg-muted/40 p-2 ring-1 ring-black/[0.06] dark:bg-muted/20 dark:ring-white/[0.06]">
                    <EndpointNav activeId={endpoint.id} onSelect={setActiveEndpointId} endpoints={endpoints} />
                  </div>
                </aside>

                <main className="min-w-0 flex-1 pb-16">
                  <EndpointDetail
                    endpoint={endpoint}
                    baseUrl={baseUrl}
                    apiKey={curlKey}
                    model={modelName}
                    gatewayBase={gatewayBase}
                    domainBase={domainBase}
                    deploymentId={id}
                  />
                </main>
              </div>
            </div>
          ) : (
            <div className="pb-16">
              <ApiKeysPanel
                deploymentId={id}
                apiKeys={apiKeys}
                isLoading={keysLoading}
                error={keysError}
                refetch={refetch}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}
