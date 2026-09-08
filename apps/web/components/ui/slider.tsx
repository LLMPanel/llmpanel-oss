"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block size-4 rounded-full border border-primary/50 bg-background shadow-sm ring-primary/30 transition-colors",
          "hover:border-primary focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none"
        )}
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
