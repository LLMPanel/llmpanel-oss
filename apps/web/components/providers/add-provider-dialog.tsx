"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Loader2,
  Eye,
  EyeOff,
  Check,
  Search,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CLOUD_PROVIDERS, type CloudProviderMeta } from "@/lib/provider-registry"
import { ProviderTile } from "./provider-brand"

/** A selectable provider: registry metadata plus its stable `type` key. */
type Provider = CloudProviderMeta & { type: string }

// The connectable catalog comes straight from the provider registry — adding
// a provider there makes it appear here automatically.
const PROVIDERS: Provider[] = Object.entries(CLOUD_PROVIDERS).map(
  ([type, meta]) => ({ type, ...meta })
)

/** Show the search field only once the list is long enough to warrant it. */
const SEARCH_THRESHOLD = 6

/** Connectable first (recommended at the very top), coming-soon last. */
const SORTED_PROVIDERS = [...PROVIDERS].sort(
  (a, b) =>
    Number(a.comingSoon ?? false) - Number(b.comingSoon ?? false) ||
    Number(b.recommended ?? false) - Number(a.recommended ?? false)
)
const CONNECTABLE = SORTED_PROVIDERS.filter((p) => !p.comingSoon)
const DEFAULT_TYPE = CONNECTABLE[0]?.type ?? ""

interface AddProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

export function AddProviderDialog({ open, onOpenChange, onAdded }: AddProviderDialogProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<string>(DEFAULT_TYPE)
  const [apiKey, setApiKey] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [query, setQuery] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = CONNECTABLE.find((p) => p.type === type) ?? CONNECTABLE[0]
  const locked = submitting || success
  const canSubmit = Boolean(name.trim() && apiKey.trim()) && !locked
  const showSearch = SORTED_PROVIDERS.length > SEARCH_THRESHOLD

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SORTED_PROVIDERS
    return SORTED_PROVIDERS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q)
    )
  }, [query])

  // Keep the selection inside the visible list: once a search hides the
  // selected provider, the credential fields below would otherwise still
  // describe a provider the user can no longer see.
  useEffect(() => {
    if (locked) return
    const selectable = filtered.filter((p) => !p.comingSoon)
    if (selectable.length === 0) return
    if (!selectable.some((p) => p.type === type)) setType(selectable[0].type)
  }, [filtered, type, locked])

  const reset = () => {
    setName("")
    setType(DEFAULT_TYPE)
    setApiKey("")
    setTotpSecret("")
    setShowKey(false)
    setQuery("")
    setSubmitting(false)
    setSuccess(false)
    setError(null)
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!selected || !name.trim() || !apiKey.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await globalThis.fetch("/api/v1/providers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          apiKey: apiKey.trim(),
          ...(type === "vastai" && totpSecret.trim()
            ? { totpSecret: totpSecret.trim() }
            : {}),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to add provider")
      setSuccess(true)
      toast.success(`${selected.label} connected successfully`)
      setTimeout(() => {
        reset()
        onOpenChange(false)
        onAdded()
      }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect provider")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-2 px-6 pt-6 pb-5">
          <DialogTitle className="text-[17px] tracking-[-0.011em]">
            Connect a GPU provider
          </DialogTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Link a cloud account to deploy models on its GPUs. Credentials are
            encrypted at rest and never leave your workspace.
          </p>
        </DialogHeader>

        <DialogBody className="max-h-[min(70vh,36rem)] space-y-6 py-5">
          {/* ── Provider selection ─────────────────────────────── */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Provider
              </Label>
              {showSearch && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {filtered.length} of {SORTED_PROVIDERS.length}
                </span>
              )}
            </div>

            {showSearch && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search providers…"
                  disabled={locked}
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
            )}

            <div
              role="radiogroup"
              aria-label="Provider"
              className={cn(
                "space-y-2",
                // Cap the list so the modal height never runs away; scroll inside.
                "max-h-[17rem] overflow-y-auto p-2"
              )}
            >
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed py-8 text-center">
                  <p className="text-sm font-medium">No providers found</p>
                  <p className="text-xs text-muted-foreground">
                    Nothing matches “{query.trim()}”.
                  </p>
                </div>
              ) : (
                filtered.map((p) => {
                  const isSelected = !p.comingSoon && selected?.type === p.type
                  return (
                    <button
                      key={p.type}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-disabled={p.comingSoon}
                      onClick={() => {
                        if (!p.comingSoon) setType(p.type)
                      }}
                      disabled={locked || p.comingSoon}
                      className={cn(
                        "group flex w-full items-center gap-3.5 rounded-xl border p-3 text-left",
                        "transition-[background-color,border-color,box-shadow,transform] duration-150",
                        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        p.comingSoon
                          ? "cursor-default border-border/60 bg-muted/20"
                          : cn(
                              "active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
                              isSelected
                                ? "border-primary bg-accent/60 shadow-sm ring-1 ring-primary"
                                : "border-border hover:border-foreground/25 hover:bg-accent/40"
                            )
                      )}
                    >
                      {/* Logo tile */}
                      <ProviderTile
                        type={p.type}
                        className={cn("size-11", p.comingSoon && "opacity-40 saturate-0")}
                      />

                      {/* Text */}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-sm font-semibold",
                              p.comingSoon ? "text-muted-foreground" : "text-foreground"
                            )}
                          >
                            {p.label}
                          </span>
                          {p.comingSoon && (
                            <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-[0.06em] text-muted-foreground">
                              Coming soon
                            </span>
                          )}
                          {p.recommended && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary-foreground">
                              <Sparkles className="size-2.5" strokeWidth={2.5} />
                              Recommended
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-xs",
                            p.comingSoon
                              ? "text-muted-foreground/60"
                              : "text-muted-foreground"
                          )}
                        >
                          {p.tagline}
                        </span>
                      </span>

                      {/* Radio indicator — only where there's something to pick */}
                      {!p.comingSoon && (
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input group-hover:border-foreground/40"
                          )}
                        >
                          {isSelected && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {/* ── Credentials ────────────────────────────────────── */}
          {selected && (
            <section className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="prov-name" className="text-sm font-medium">
                  Connection name
                </Label>
                <Input
                  id="prov-name"
                  placeholder={`My ${selected.label} account`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={locked}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  A label to help you recognize this connection later.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="prov-key" className="text-sm font-medium">
                    {selected.keyLabel}
                  </Label>
                  <a
                    href={selected.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Where do I find this?
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="prov-key"
                    type={showKey ? "text" : "password"}
                    placeholder={selected.keyPlaceholder}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={locked}
                    className="pr-10 font-mono text-xs"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    disabled={locked}
                    aria-label={showKey ? "Hide key" : "Show key"}
                    className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    tabIndex={-1}
                  >
                    {/* Cross-fade the two icons instead of a hard swap. */}
                    <span className="relative block size-4">
                      <Eye
                        className={cn(
                          "absolute inset-0 size-4 transition-[transform,opacity,filter] duration-200",
                          showKey ? "scale-50 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0",
                        )}
                      />
                      <EyeOff
                        className={cn(
                          "absolute inset-0 size-4 transition-[transform,opacity,filter] duration-200",
                          showKey ? "scale-100 opacity-100 blur-0" : "scale-50 opacity-0 blur-[2px]",
                        )}
                      />
                    </span>
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {selected.keyHint}
                </p>
              </div>

              {/* Vast.ai only: optional 2FA secret to satisfy Vast.ai's Two-Factor
                  Authentication gate on write actions (creating instances). */}
              {selected.type === "vastai" && (
                <div className="space-y-1.5">
                  <Label htmlFor="prov-totp" className="text-sm font-medium">
                    2FA secret (TOTP){" "}
                    <span className="font-normal text-muted-foreground">— optional</span>
                  </Label>
                  <Input
                    id="prov-totp"
                    type="password"
                    placeholder="Base32 secret, e.g. JBSWY3DPEHPK3PXP"
                    value={totpSecret}
                    onChange={(e) => setTotpSecret(e.target.value)}
                    disabled={locked}
                    className="font-mono text-xs"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Only needed if your Vast.ai account has 2FA enabled. Paste the
                    authenticator (TOTP) secret shown when you set up 2FA — LLMPanel
                    uses it to authorize deployments. Leave blank if you don’t use 2FA.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── Error ──────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs leading-relaxed">{error}</p>
            </div>
          )}

          {/* ── Security note ──────────────────────────────────── */}
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3.5 py-2.5">
            <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Your key is encrypted with AES-256 and stored only in your workspace.
            </p>
          </div>
        </DialogBody>

        <DialogFooter className="px-6 py-4">
          <Button
            variant="outline"
            onClick={close}
            disabled={submitting}
            className="transition-transform active:scale-[0.97]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="min-w-[9.5rem] transition-transform active:scale-[0.97]"
          >
            {success ? (
              <><Check className="size-4" /> Connected</>
            ) : submitting ? (
              <><Loader2 className="size-4 animate-spin" /> Verifying…</>
            ) : (
              <>Connect provider <ArrowRight className="size-4" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
