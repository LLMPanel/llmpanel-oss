"use client"

import * as React from "react"
import { Select } from "radix-ui"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const SelectRoot    = Select.Root
const SelectGroup   = Select.Group
const SelectValue   = Select.Value

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof Select.Trigger>) {
  return (
    <Select.Trigger
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs",
        "placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&>span]:line-clamp-1",
        className
      )}
      {...props}
    >
      {children}
      <Select.Icon asChild>
        <ChevronDown className="size-4 opacity-50" />
      </Select.Icon>
    </Select.Trigger>
  )
}

function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof Select.Content>) {
  return (
    <Select.Portal>
      <Select.Content
        className={cn(
          "relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <Select.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
          <ChevronDown className="size-4 rotate-180" />
        </Select.ScrollUpButton>
        <Select.Viewport className={cn("p-1", position === "popper" && "max-h-60")}>
          {children}
        </Select.Viewport>
        <Select.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
          <ChevronDown className="size-4" />
        </Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof Select.Label>) {
  return (
    <Select.Label
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof Select.Item>) {
  return (
    <Select.Item
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <Select.ItemIndicator>
          <Check className="size-4" />
        </Select.ItemIndicator>
      </span>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof Select.Separator>) {
  return (
    <Select.Separator
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  )
}

export {
  SelectRoot as Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
}
