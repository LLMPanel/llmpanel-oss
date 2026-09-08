"use client"

import { cn } from "@/lib/utils"

/** 0–4: length, extra length or mixed case, digits, symbols. */
export function scorePassword(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  return Math.min(score, 4)
}

const STRENGTH_LEVELS = [
  { label: "Too weak", color: "bg-destructive" },
  { label: "Weak", color: "bg-destructive" },
  { label: "Fair", color: "bg-warning" },
  { label: "Good", color: "bg-success" },
  { label: "Strong", color: "bg-success" },
] as const

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = scorePassword(password)
  const level = STRENGTH_LEVELS[score]

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-[background-color] duration-300",
              password && index < score ? level.color : "bg-muted"
            )}
          />
        ))}
      </div>
      <span
        aria-live="polite"
        className="w-16 text-right text-xs text-muted-foreground"
      >
        {password ? level.label : ""}
      </span>
    </div>
  )
}
