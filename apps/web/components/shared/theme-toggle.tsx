"use client"

import { Sun, Moon, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "./theme-provider"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const options = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ]

  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/50 p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() => setTheme(value)}
          className={cn(
            "h-7 w-7 p-0 rounded-md",
            theme === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-transparent"
          )}
          title={label}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  )
}
