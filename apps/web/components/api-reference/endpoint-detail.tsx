"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { MethodBadge } from "./method-badge"
import { CurlSnippet } from "./curl-snippet"
import { ParamTable } from "./param-table"
import { CopyButton } from "./copy-button"
import type { Endpoint, SnippetOpts } from "./endpoints-data"

interface EndpointDetailProps {
  endpoint: Endpoint
  baseUrl: string
  apiKey: string
  model: string
  /** LLMPanel API origin for gateway-served endpoints. */
  gatewayBase?: string
  /** The deployment's own routable origin (https://<domain>) when wildcard DNS is configured. */
  domainBase?: string | null
  deploymentId?: string
}

export function EndpointDetail({
  endpoint,
  baseUrl,
  apiKey,
  model,
  gatewayBase = "",
  domainBase = null,
  deploymentId = "",
}: EndpointDetailProps) {
  const opts: SnippetOpts = { base: baseUrl, key: apiKey, model, gatewayBase, domainBase, deploymentId }

  const snippets: Array<{ id: string; label: string; code: string }> = [
    { id: "curl", label: "cURL", code: endpoint.curl(opts) },
  ]
  if (endpoint.python) snippets.push({ id: "python", label: "Python", code: endpoint.python(opts) })
  if (endpoint.javascript) snippets.push({ id: "javascript", label: "JavaScript", code: endpoint.javascript(opts) })

  // Gateway endpoints prefer the deployment's own subdomain — the clean
  // OpenAI-style URL — and fall back to the path-scoped gateway form.
  const fullPath =
    endpoint.gateway && domainBase && endpoint.subdomainPath
      ? `${domainBase}${endpoint.subdomainPath}`
      : `${endpoint.gateway ? gatewayBase : baseUrl}${endpoint.path.replace("{deploymentId}", deploymentId || "{deploymentId}")}`

  const views = [
    ...snippets.map((sn) => ({ value: sn.id, label: sn.label })),
    ...(endpoint.params && endpoint.params.length > 0
      ? [{ value: "params", label: `Parameters · ${endpoint.params.length}` }]
      : []),
    { value: "response", label: "Response" },
  ]
  const [view, setView] = useState(views[0].value)
  // Fall back when the endpoint changes and the previous view no longer exists.
  const activeView = views.some((v) => v.value === view) ? view : views[0].value
  const activeSnippet = snippets.find((sn) => sn.id === activeView)

  return (
    <div className="space-y-6">
      {/* ── Endpoint header ── */}
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{endpoint.category}</span>
          {endpoint.gateway && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>Gateway</span>
            </>
          )}
        </p>
        <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">{endpoint.title}</h2>
        <p className="text-[14px] leading-[1.5] text-muted-foreground">{endpoint.description}</p>

        {/* URL bar */}
        <div className="mt-1 flex items-center gap-3 rounded-2xl bg-muted py-2 pl-4 pr-2">
          <MethodBadge method={endpoint.method} />
          <code className="flex-1 truncate font-mono text-[13px]">{fullPath}</code>
          <CopyButton text={fullPath} className="text-muted-foreground hover:bg-background hover:text-foreground" />
        </div>
      </div>

      {/* ── Views: code / params / response ── */}
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <SegmentedControl label="View" value={activeView} options={views} onChange={setView} />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${endpoint.id}:${activeView}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            {activeSnippet ? (
              <>
                <CurlSnippet code={activeSnippet.code} label={activeSnippet.label} />
                {apiKey.includes("YOUR_API_KEY") && (
                  <p className="mt-2 px-1 text-[12px] text-muted-foreground">
                    Choose a key above to fill in the placeholder.
                  </p>
                )}
              </>
            ) : activeView === "params" && endpoint.params ? (
              <ParamTable params={endpoint.params} />
            ) : (
              <div className="overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/[0.08]">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-1.5">
                  <span className="text-[12px] font-medium text-zinc-400">Example response</span>
                  <CopyButton text={endpoint.responseExample} />
                </div>
                <pre className="overflow-x-auto whitespace-pre px-5 py-4 font-mono text-[12px] leading-[1.6] text-zinc-300">
                  {endpoint.responseExample}
                </pre>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
