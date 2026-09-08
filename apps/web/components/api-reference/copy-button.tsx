"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export function CopyButton({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      onClick={() => void handle()}
      title="Copy to clipboard"
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
        "transition-[transform,background-color,color] duration-100 active:scale-[0.94]",
        "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
        copied && "text-success hover:text-success",
        className
      )}
    >
      {copied ? (
        <><Check className="size-3.5" /> Copied</>
      ) : (
        <><Copy className="size-3.5" /> Copy</>
      )}
    </button>
  )
}
