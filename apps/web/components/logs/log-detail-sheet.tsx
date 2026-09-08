"use client"

import { motion } from "motion/react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Radio, Zap } from "lucide-react"
import type { RequestLog } from "@/hooks/use-logs"
import { cn } from "@/lib/utils"
import { StatusDot } from "./logs-table"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function statusText(code: number) {
  if (code >= 200 && code < 300) return "OK"
  if (code >= 400 && code < 500) return "Client error"
  return "Server error"
}

// ── Inset grouped list (Settings-style) ───────────────────────────────────────

const spring = { type: "spring", bounce: 0, duration: 0.4 } as const

function Group({
  title,
  children,
  index,
}: {
  title: string
  children: React.ReactNode
  index: number
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.04 + index * 0.035 }}
    >
      <h3 className="mb-1.5 px-3 text-[12px] font-medium text-muted-foreground">{title}</h3>
      <div className="divide-y divide-black/[0.05] overflow-hidden rounded-xl bg-muted/50 dark:divide-white/[0.06] dark:bg-muted/30">
        {children}
      </div>
    </motion.section>
  )
}

function Row({
  label,
  value,
  mono,
  className,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-[13px]">{label}</span>
      <span
        className={cn(
          "min-w-0 break-all text-right text-[13px] text-muted-foreground",
          mono && "font-mono text-[12px]",
          className
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ── Token bar ─────────────────────────────────────────────────────────────────

function TokenBar({ prompt, completion, total }: { prompt: number; completion: number; total: number }) {
  const promptPct = total > 0 ? (prompt / total) * 100 : 50
  return (
    <div className="space-y-2.5 px-3 py-3">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <motion.div
          className="bg-chart-1"
          initial={{ width: 0 }}
          animate={{ width: `${promptPct}%` }}
          transition={spring}
        />
        <motion.div
          className="bg-chart-2"
          initial={{ width: 0 }}
          animate={{ width: `${100 - promptPct}%` }}
          transition={spring}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Prompt", value: prompt, dot: "bg-chart-1" },
          { label: "Completion", value: completion, dot: "bg-chart-2" },
          { label: "Total", value: total, dot: null },
        ].map(({ label, value, dot }) => (
          <div key={label}>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {dot && <span className={cn("size-1.5 rounded-full", dot)} />}
              {label}
            </p>
            <p className="text-[15px] font-semibold tracking-[-0.01em] tabular-nums">{fmt(value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Request/response body rendering ───────────────────────────────────────────

type ParsedMessage = { role: string; content: string }

function safeParse(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json) as unknown
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content
  if (content == null) return ""
  return JSON.stringify(content, null, 2)
}

function extractMessages(body: Record<string, unknown>): ParsedMessage[] {
  if (!Array.isArray(body.messages)) return []
  return (body.messages as Array<{ role?: string; content?: unknown }>).map((m) => ({
    role: m.role ?? "unknown",
    content: contentToText(m.content),
  }))
}

function extractCompletionText(body: Record<string, unknown>): string | null {
  const choices = body.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown }
  if (first.message?.content != null) return contentToText(first.message.content)
  if (first.text != null) return contentToText(first.text)
  return null
}

function prettyJson(json: string): string {
  const parsed = safeParse(json)
  return parsed ? JSON.stringify(parsed, null, 2) : json
}

const ROLE_TONE: Record<string, string> = {
  system: "text-warning",
  user: "text-primary",
  assistant: "text-chart-2",
  tool: "text-success",
}

function Pre({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[12px] leading-relaxed",
        className
      )}
    >
      {children}
    </pre>
  )
}

function MessageBlock({ role, content }: ParsedMessage) {
  return (
    <div>
      <p className={cn("px-3 pt-2.5 text-[11px] font-semibold capitalize", ROLE_TONE[role] ?? "text-muted-foreground")}>
        {role}
      </p>
      <Pre>{content || "(empty)"}</Pre>
    </div>
  )
}

function BodyGroup({ title, json, index }: { title: string; json: string; index: number }) {
  const parsed = safeParse(json)
  const messages = parsed ? extractMessages(parsed) : []
  const completionText = parsed ? extractCompletionText(parsed) : null
  const structured = messages.length > 0 || completionText != null

  return (
    <Group title={title} index={index}>
      {messages.length > 0 ? (
        messages.map((m, i) => <MessageBlock key={i} role={m.role} content={m.content} />)
      ) : completionText != null ? (
        <MessageBlock role="assistant" content={completionText} />
      ) : (
        <Pre>{prettyJson(json)}</Pre>
      )}
      {structured && (
        <details className="group/raw">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
            Raw JSON
          </summary>
          <Pre className="max-h-80 pt-0">{prettyJson(json)}</Pre>
        </details>
      )}
    </Group>
  )
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

interface LogDetailSheetProps {
  log: RequestLog | null
  open: boolean
  onClose: () => void
}

export function LogDetailSheet({ log, open, onClose }: LogDetailSheetProps) {
  let section = 0
  const next = () => section++

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        className={cn(
          "w-full gap-0 overflow-y-auto border-l border-black/[0.06] bg-background/85 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-xl dark:border-white/[0.08]",
          "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
        )}
      >
        {log && (
          <>
            {/* Floating header: content scrolls beneath it. */}
            <div className="sticky top-0 z-10 bg-background/70 px-6 pb-4 pt-5 backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-background">
              <div className="flex items-center gap-2">
                <StatusDot code={log.statusCode} className="size-2.5" />
                <SheetTitle className="text-[20px] font-semibold tracking-[-0.02em]">
                  {log.statusCode} {statusText(log.statusCode)}
                </SheetTitle>
                <span
                  className={cn(
                    "ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium",
                    log.isStreaming ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {log.isStreaming ? <Radio className="size-3" /> : <Zap className="size-3" />}
                  {log.isStreaming ? "Streaming" : "Sync"}
                </span>
              </div>
              <SheetDescription className="mt-0.5 text-[13px]">
                {new Date(log.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                <span className="font-mono text-[11px]">{log.id}</span>
              </SheetDescription>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-4 h-4 bg-gradient-to-b from-background/70 to-transparent" />
            </div>

            <div className="space-y-5 px-6 pb-8 pt-2">
              <Group title="Request" index={next()}>
                <Row label="Method" value={log.method} mono />
                <Row label="Path" value={log.path} mono />
                {log.ipAddress && <Row label="IP address" value={log.ipAddress} mono />}
              </Group>

              <Group title="Inference" index={next()}>
                {log.model && <Row label="Model" value={log.model} mono />}
                {log.deploymentName && <Row label="Deployment" value={log.deploymentName} />}
                <Row
                  label="Latency"
                  value={log.latencyMs >= 1000 ? `${(log.latencyMs / 1000).toFixed(2)} s` : `${log.latencyMs} ms`}
                  className={cn(
                    "tabular-nums",
                    log.latencyMs < 500 ? "text-foreground" : log.latencyMs < 2000 ? "text-warning" : "text-destructive"
                  )}
                />
              </Group>

              {log.totalTokens != null && log.totalTokens > 0 && (
                <Group title="Tokens" index={next()}>
                  <TokenBar
                    prompt={log.promptTokens ?? 0}
                    completion={log.completionTokens ?? 0}
                    total={log.totalTokens}
                  />
                </Group>
              )}

              {(log.apiKeyName ?? log.apiKeyPrefix) && (
                <Group title="Authentication" index={next()}>
                  {log.apiKeyName && <Row label="API key" value={log.apiKeyName} />}
                  {log.apiKeyPrefix && <Row label="Prefix" value={log.apiKeyPrefix} mono />}
                </Group>
              )}

              {log.requestBody && <BodyGroup title="Input" json={log.requestBody} index={next()} />}
              {log.responseBody && <BodyGroup title="Output" json={log.responseBody} index={next()} />}

              {log.userAgent && (
                <Group title="Client" index={next()}>
                  <p className="break-all px-3 py-2.5 font-mono text-[12px] leading-relaxed text-muted-foreground">
                    {log.userAgent}
                  </p>
                </Group>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
