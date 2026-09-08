"use client"

import { useState, useMemo } from "react"
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Search,
  Database,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useRegistryModels } from "@/hooks/use-registry-models"
import { ModelCard } from "@/components/models/model-card"

export default function ModelsPage() {
  const [search, setSearch] = useState("")
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)

  const params = useMemo(
    () => ({
      ...(search.length >= 2 ? { search } : {}),
      ...(selectedFamily ? { family: selectedFamily } : {}),
    }),
    [search, selectedFamily]
  )

  const { models, families, total, isLoading, error, refetch } =
    useRegistryModels(params)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Model Registry
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse available models and their quantizations
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          className="size-9"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {families.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {families.map((f) => (
              <Badge
                key={f}
                variant={selectedFamily === f ? "default" : "outline"}
                className="cursor-pointer text-[11px] capitalize"
                onClick={() =>
                  setSelectedFamily(selectedFamily === f ? null : f)
                }
              >
                {f}
              </Badge>
            ))}
            {selectedFamily && (
              <button
                onClick={() => setSelectedFamily(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground ml-1"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Total count */}
      {!isLoading && !error && (
        <p className="text-xs text-muted-foreground">
          {total} model{total !== 1 ? "s" : ""} available
        </p>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Loading models from registry...
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-5 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-medium">Failed to load models</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Database className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No models found</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {search || selectedFamily
                ? "Try adjusting your search or filters"
                : "The model registry is empty"}
            </p>
          </div>
          {(search || selectedFamily) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setSelectedFamily(null)
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>
      )}
    </div>
  )
}
