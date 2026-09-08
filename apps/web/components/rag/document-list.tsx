"use client"

import { FileText, Trash2, Loader2, Check, AlertCircle, Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { RagDocument } from "@/hooks/use-rag"
import { cn } from "@/lib/utils"

interface DocumentListProps {
  documents: RagDocument[]
  isLoading: boolean
  onDelete: (documentId: string) => void
}

const statusConfig = {
  processing: {
    icon: Loader2,
    label: "Processing",
    variant: "blue" as const,
    animate: true,
  },
  ready: {
    icon: Check,
    label: "Ready",
    variant: "success" as const,
    animate: false,
  },
  failed: {
    icon: AlertCircle,
    label: "Failed",
    variant: "destructive" as const,
    animate: false,
  },
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function DocumentList({
  documents,
  isLoading,
  onDelete,
}: DocumentListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
        <FileText className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium">No documents yet</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Upload files to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {documents.map((doc) => {
        const config = statusConfig[doc.status as keyof typeof statusConfig] ?? statusConfig.processing
        const Icon = config.icon

        return (
          <div
            key={doc.id}
            className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/30"
          >
            <div className="flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0">
              <FileText className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium truncate">{doc.fileName}</p>
                <Badge variant={config.variant} className="text-[9px] px-1.5 py-0 gap-1">
                  <Icon className={cn("size-2.5", config.animate && "animate-spin")} />
                  {config.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {formatBytes(doc.fileSize)}
                </span>
                {doc.chunkCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Hash className="size-2.5" />
                    {doc.chunkCount} chunks
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(doc.createdAt)}
                </span>
              </div>
              {doc.errorMessage && (
                <p className="text-[10px] text-destructive mt-0.5 truncate">
                  {doc.errorMessage}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={() => onDelete(doc.id)}
            >
              <Trash2 className="size-3 text-destructive" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
