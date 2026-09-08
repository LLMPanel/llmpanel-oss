"use client"

import { ArrowLeft, Database, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { Deployment } from "@/hooks/use-deployments"

interface RagHeaderProps {
  deployment: Deployment
  onCreateCollection: () => void
  collectionCount: number
}

export function RagHeader({
  deployment,
  onCreateCollection,
  collectionCount,
}: RagHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href={`/dashboard/deployments/${deployment.id}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
            <Database className="size-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                Knowledge Base
              </h1>
              {collectionCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {collectionCount} collection{collectionCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {deployment.model?.name ?? deployment.huggingfaceId} — RAG Pipeline
            </p>
          </div>
        </div>
      </div>
      <Button onClick={onCreateCollection} className="gap-2" size="sm">
        <Plus className="size-4" />
        New Collection
      </Button>
    </div>
  )
}
