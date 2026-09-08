"use client"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, X } from "lucide-react"

export interface InstanceFilters {
  search: string
  provider: string
  gpuBrand: string
  availability: string
  minVram: string
  maxVram: string
  minTflops: string
}

export const defaultFilters: InstanceFilters = {
  search: "",
  provider: "all",
  gpuBrand: "all",
  availability: "all",
  minVram: "",
  maxVram: "",
  minTflops: "",
}

interface InstanceFiltersBarProps {
  filters: InstanceFilters
  onChange: (filters: InstanceFilters) => void
  providerOptions: Array<{ id: string; name: string; type: string }>
  activeFilterCount: number
}

export function InstanceFiltersBar({
  filters,
  onChange,
  providerOptions,
  activeFilterCount,
}: InstanceFiltersBarProps) {
  const update = (patch: Partial<InstanceFilters>) =>
    onChange({ ...filters, ...patch })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search GPU name..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Provider */}
        <Select
          value={filters.provider}
          onValueChange={(v) => update({ provider: v })}
        >
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providerOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* GPU Brand */}
        <Select
          value={filters.gpuBrand}
          onValueChange={(v) => update({ gpuBrand: v })}
        >
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue placeholder="GPU Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All GPUs</SelectItem>
            <SelectItem value="nvidia">NVIDIA</SelectItem>
            <SelectItem value="amd">AMD</SelectItem>
            <SelectItem value="intel">Intel</SelectItem>
          </SelectContent>
        </Select>

        {/* Availability */}
        <Select
          value={filters.availability}
          onValueChange={(v) => update({ availability: v })}
        >
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All availability</SelectItem>
            <SelectItem value="available">In stock</SelectItem>
            <SelectItem value="high">High stock</SelectItem>
          </SelectContent>
        </Select>

        {/* Min VRAM */}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            placeholder="Min VRAM"
            value={filters.minVram}
            onChange={(e) => update({ minVram: e.target.value })}
            className="w-[100px] h-8 text-sm"
            min={0}
          />
          <span className="text-xs text-muted-foreground">GB</span>
        </div>

        {/* Max VRAM */}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            placeholder="Max VRAM"
            value={filters.maxVram}
            onChange={(e) => update({ maxVram: e.target.value })}
            className="w-[100px] h-8 text-sm"
            min={0}
          />
          <span className="text-xs text-muted-foreground">GB</span>
        </div>

        {/* Min TFLOPS */}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            placeholder="Min TFLOPS"
            value={filters.minTflops}
            onChange={(e) => update({ minTflops: e.target.value })}
            className="w-[110px] h-8 text-sm"
            min={0}
            step={0.1}
          />
        </div>

        {/* Clear */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onChange(defaultFilters)}
          >
            <X className="size-3 mr-1" />
            Clear
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
              {activeFilterCount}
            </Badge>
          </Button>
        )}
      </div>
    </div>
  )
}
