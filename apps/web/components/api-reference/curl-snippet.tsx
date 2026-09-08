"use client"

import { CopyButton } from "./copy-button"
import { Terminal } from "lucide-react"

interface CurlSnippetProps {
  code: string
  label?: string
}

export function CurlSnippet({ code, label = "cURL" }: CurlSnippetProps) {
  // Syntax-highlight tokens: flags (-H, -d, --no-buffer), strings, URLs
  const highlighted = code
    .replace(/(curl\s)/g, '<span class="text-yellow-400 font-bold">$1</span>')
    .replace(/(\s-{1,2}[\w-]+)/g, '<span class="text-sky-400">$1</span>')
    .replace(/(Bearer\s+\S+)/g, 'Bearer <span class="text-emerald-400">$&</span>'.replace("Bearer ", ""))
    // No `s` flag (needs ES2018+): [^']* already spans newlines by itself.
    .replace(/'([^']*)'/g, `<span class="text-orange-300">'$1'</span>`)

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/[0.08]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-1.5">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="size-3.5" />
          <span className="text-[12px] font-medium">{label}</span>
        </div>
        <CopyButton text={code} />
      </div>
      {/* Code */}
      <pre className="overflow-x-auto whitespace-pre px-5 py-4 font-mono text-[12px] leading-[1.6] text-zinc-300">
        {code}
      </pre>
    </div>
  )
}
