"use client"

import { useState } from "react"
import { Database, Cloud } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { DocumentUpload } from "./document-upload"
import { DocumentList } from "./document-list"
import { RagChat } from "./rag-chat"
import { RetrievalTest } from "./retrieval-test"
import { CollectionAgents } from "./collection-agents"
import { CollectionSettings } from "./collection-settings"
import { findPreset } from "./embedding-models"
import type { RagCollection } from "@/hooks/use-rag"
import { useRagDocuments, deleteRagDocument } from "@/hooks/use-rag"
import { toast } from "sonner"

interface CollectionDetailProps {
  collection: RagCollection
  deploymentId: string
  /** Re-fetch the collections list (counters, connected agents, settings). */
  onChanged: () => void
  /** Delete this collection (confirmation handled by the caller). */
  onDelete: () => void
}

const EMBEDDING_SOURCE_LABEL: Record<string, string> = {
  builtin: "Built‑in",
  deployment: "Deployment",
  external: "External",
}

type DetailTab = "documents" | "retrieval" | "chat" | "agents" | "settings"

export function CollectionDetail({
  collection,
  deploymentId,
  onChanged,
  onDelete,
}: CollectionDetailProps) {
  const { documents, isLoading: docsLoading, refetch: refetchDocs } =
    useRagDocuments(deploymentId, collection.id)
  const [activeTab, setActiveTab] = useState<DetailTab>("documents")

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Delete this document and all its chunks?")) return
    try {
      await deleteRagDocument(deploymentId, collection.id, docId)
      toast.success("Document deleted")
      void refetchDocs()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  const embeddingLabel = EMBEDDING_SOURCE_LABEL[collection.embeddingSource] ?? "Built‑in"
  const modelLabel =
    findPreset(collection.embeddingModel ?? "")?.label ??
    collection.embeddingModel ??
    "default model"
  const connectedAgents = collection.connectedAgents ?? []

  const Icon = collection.vectorStoreType === "qdrant" ? Cloud : Database
  const facts = [
    collection.vectorStoreType === "qdrant" ? "Qdrant" : "Local index",
    `${embeddingLabel} · ${modelLabel}`,
    `${collection.embeddingDimensions}d`,
    `${collection.chunkSize}/${collection.chunkOverlap} chunking`,
    `top ${collection.topK} · ≥${collection.scoreThreshold}`,
  ]

  const TABS = [
    { value: "documents", label: "Documents" },
    { value: "retrieval", label: "Retrieval" },
    { value: "chat", label: "Chat" },
    { value: "agents", label: connectedAgents.length > 0 ? `Agents · ${connectedAgents.length}` : "Agents" },
    { value: "settings", label: "Settings" },
  ] as const satisfies readonly { value: DetailTab; label: string }[]

  return (
    <div className="flex h-full flex-col">
      {/* Collection header */}
      <div className="space-y-3 px-5 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">{collection.name}</h2>
            {collection.description && (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{collection.description}</p>
            )}
          </div>
        </div>

        {/* Facts as one quiet line — the same data, without a row of coloured badges. */}
        <p className="text-[12px] leading-[1.6] text-muted-foreground">
          <span className="font-medium text-foreground/80 tabular-nums">
            {collection.documentCount} doc{collection.documentCount === 1 ? "" : "s"} · {collection.totalChunks} chunks
          </span>
          {facts.map((f) => (
            <span key={f}>
              <span className="text-muted-foreground/40"> · </span>
              {f}
            </span>
          ))}
        </p>

        <div className="overflow-x-auto">
          <SegmentedControl<DetailTab>
            label="Section"
            value={activeTab}
            options={TABS}
            onChange={setActiveTab}
            className="w-full [&>button]:flex-1"
          />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className={activeTab === "chat" ? "flex h-full min-h-0 flex-col" : "h-full overflow-y-auto px-5 pb-5"}
          >
            {activeTab === "documents" && (
              <div className="space-y-4 pt-1">
                <DocumentUpload
                  deploymentId={deploymentId}
                  collectionId={collection.id}
                  onUploaded={() => {
                    void refetchDocs()
                    onChanged()
                  }}
                />
                <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />
                <DocumentList
                  documents={documents}
                  isLoading={docsLoading}
                  onDelete={(id) => void handleDeleteDoc(id)}
                />
              </div>
            )}
            {activeTab === "retrieval" && (
              <RetrievalTest collection={collection} deploymentId={deploymentId} />
            )}
            {activeTab === "chat" && (
              <RagChat
                deploymentId={deploymentId}
                collectionId={collection.id}
                collectionName={collection.name}
              />
            )}
            {activeTab === "agents" && (
              <CollectionAgents collection={collection} deploymentId={deploymentId} onChanged={onChanged} />
            )}
            {activeTab === "settings" && (
              <CollectionSettings
                collection={collection}
                deploymentId={deploymentId}
                onSaved={onChanged}
                onDelete={onDelete}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
