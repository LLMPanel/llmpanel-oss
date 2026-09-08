"use client"

import { use, useState } from "react"
import { Loader2, AlertCircle, RefreshCw, Plus } from "lucide-react"
import { MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useDeployment } from "@/hooks/use-deployments"
import {
  useRagCollections,
  deleteRagCollection,
} from "@/hooks/use-rag"
import { RagEmptyState } from "@/components/rag/rag-empty-state"
import { CollectionForm } from "@/components/rag/collection-form"
import { CollectionSidebar } from "@/components/rag/collection-sidebar"
import { CollectionDetail } from "@/components/rag/collection-detail"

export default function RagPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const { deployment, isLoading, error, refetch } = useDeployment(id)
  const {
    collections,
    isLoading: collectionsLoading,
    refetch: refetchCollections,
  } = useRagCollections(id)

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Auto-select first collection
  const selectedCollection =
    collections.find((c) => c.id === selectedCollectionId) ?? collections[0] ?? null

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading deployment...</p>
      </div>
    )
  }

  if (error || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">{error ?? "Deployment not found"}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          className="gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  const handleDeleteCollection = async (collectionId: string) => {
    if (!confirm("Delete this collection and all its documents?")) return
    try {
      await deleteRagCollection(id, collectionId)
      toast.success("Collection deleted")
      if (selectedCollectionId === collectionId) {
        setSelectedCollectionId(null)
      }
      void refetchCollections()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  const hasCollections = collections.length > 0

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Knowledge Base</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Collections of documents your model and agents can retrieve from.
          </p>
        </div>
        {hasCollections && (
          <Button
            onClick={() => setShowCreateForm(true)}
            className="h-9 gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-transform active:scale-[0.96]"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            New Collection
          </Button>
        )}
      </header>

      {!hasCollections && !collectionsLoading ? (
        <RagEmptyState onCreateCollection={() => setShowCreateForm(true)} />
      ) : (
        <div className="grid min-h-[600px] grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          {/* Sidebar: grouped list on a muted ground */}
          <div className="overflow-hidden rounded-2xl bg-muted/40 ring-1 ring-black/[0.06] dark:bg-muted/20 dark:ring-white/[0.06]">
            <CollectionSidebar
              collections={collections}
              isLoading={collectionsLoading}
              selectedId={selectedCollection?.id ?? null}
              onSelect={setSelectedCollectionId}
              onDelete={(cid) => void handleDeleteCollection(cid)}
            />
          </div>

          {/* Main content */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
            {selectedCollection ? (
              <CollectionDetail
                collection={selectedCollection}
                deploymentId={id}
                onChanged={() => void refetchCollections()}
                onDelete={() => void handleDeleteCollection(selectedCollection.id)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-[13px] text-muted-foreground">
                  Select a collection to view its documents.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <CollectionForm
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        deploymentId={id}
        onCreated={() => void refetchCollections()}
      />
    </div>
    </MotionConfig>
  )
}
