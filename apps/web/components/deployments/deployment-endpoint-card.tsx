"use client"

import { useState } from "react"
import { Copy, Check, ChevronDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "transition-colors duration-100 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:transition-none",
        copied && "text-success hover:text-success"
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  )
}

interface DeploymentEndpointCardProps {
  endpoint: string
  modelSlug: string
  /** Auto-generated routable hostname for this deployment, if available. */
  domain?: string | null
}

/**
 * The section header already says "Endpoint" and the top bar already says the
 * deployment is running, so this card carries no title, no icon chip, no "Live"
 * badge and no success-tinted border. It is the URL, and what you do with it.
 */
export function DeploymentEndpointCard({
  endpoint,
  modelSlug,
  domain,
}: DeploymentEndpointCardProps) {
  const [showCurl, setShowCurl] = useState(false)

  // Prefer the stable per-deployment domain over the raw provider IP:port.
  const protocol = domain && domain.endsWith(".localhost") ? "http" : "https"
  const publicUrl = domain ? `${protocol}://${domain}` : endpoint

  const curlSnippet = `curl ${publicUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $LLMPANEL_API_KEY" \\
  -d '{"model":"${modelSlug}","messages":[{"role":"user","content":"Hello!"}]}'`

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* The URL is the point of the card, so it gets the whole first row. */}
      <div className="flex items-center gap-3 px-5 py-4">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
          {publicUrl}
        </code>
        <CopyBtn value={publicUrl} />
      </div>

      {/* Only worth showing when it isn't the same string as above. */}
      {domain && endpoint !== publicUrl && (
        <div className="flex items-baseline gap-2 border-t border-border/60 px-5 py-2.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            Provider
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/70">
            {endpoint}
          </code>
        </div>
      )}

      <div className="border-t border-border/60">
        <button
          onClick={() => setShowCurl((v) => !v)}
          aria-expanded={showCurl}
          className={cn(
            "flex w-full items-center gap-1.5 px-5 py-2.5 text-[11px] font-medium",
            "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            "transition-colors duration-100 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
            "motion-reduce:transition-none"
          )}
        >
          Test with curl
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              showCurl && "rotate-180"
            )}
          />
        </button>

        {showCurl && (
          <div className="relative border-t border-border/60 bg-muted/40">
            <div className="absolute right-2 top-2">
              <CopyBtn value={curlSnippet} />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all px-5 py-4 pr-20 font-mono text-[11.5px] leading-relaxed text-foreground/80">
              {curlSnippet}
            </pre>
          </div>
        )}
      </div>
    </Card>
  )
}
