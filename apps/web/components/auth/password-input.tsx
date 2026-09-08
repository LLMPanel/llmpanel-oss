"use client"

import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

const iconBase =
  "absolute inset-0 size-4 transition-[opacity,scale,filter] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]"
const iconVisible = "scale-100 opacity-100 blur-none"
const iconHidden = "scale-[0.25] opacity-0 blur-[4px]"

export function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative">
      <Input
        type={revealed ? "text" : "password"}
        className={cn("pr-10", className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={revealed ? "Hide password" : "Show password"}
        onClick={() => setRevealed((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none transition-[color] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="relative size-4">
          <Eye className={cn(iconBase, revealed ? iconHidden : iconVisible)} />
          <EyeOff className={cn(iconBase, revealed ? iconVisible : iconHidden)} />
        </span>
      </button>
    </div>
  )
}
