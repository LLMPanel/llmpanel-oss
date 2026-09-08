"use client"

import { useState } from "react"
import { Check, Copy, Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useOrigin } from "@/hooks/use-origin"
import { inviteLinkFor } from "@/lib/workspace"

function useCopy() {
  const [copied, setCopied] = useState(false)

  const copy = async (text: string) => {
    if (!text) return
    try {
      await globalThis.navigator.clipboard.writeText(text)
      setCopied(true)
      globalThis.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard is blocked (insecure origin / denied permission). The link is
      // visible in the field either way, so the user can select it manually.
    }
  }

  return { copied, copy }
}

/** Read-only field + copy button — the primary way an invite gets shared. */
export function InviteLinkBox({ invitationId }: { invitationId: string }) {
  const origin = useOrigin()
  const { copied, copy } = useCopy()
  const link = origin ? inviteLinkFor(origin, invitationId) : ""

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={link}
        aria-label="Invitation link"
        onFocus={(event) => event.currentTarget.select()}
        className="font-mono text-xs"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => void copy(link)}
        disabled={!link}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

/** Compact variant for table rows. */
export function CopyInviteLinkButton({
  invitationId,
  className,
}: {
  invitationId: string
  className?: string
}) {
  const origin = useOrigin()
  const { copied, copy } = useCopy()
  const link = origin ? inviteLinkFor(origin, invitationId) : ""

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={!link}
      onClick={() => void copy(link)}
      title="Copy invite link"
    >
      {copied ? (
        <Check className="text-success" />
      ) : (
        <Link2 className="text-muted-foreground" />
      )}
      {copied ? "Copied" : "Copy link"}
    </Button>
  )
}
