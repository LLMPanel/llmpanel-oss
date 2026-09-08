"use client"

import { useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { updateRagCollection, type RagCollection } from "@/hooks/use-rag"

export function CollectionSettings({
  collection,
  deploymentId,
  onSaved,
  onDelete,
}: {
  collection: RagCollection
  deploymentId: string
  onSaved: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(collection.name)
  const [description, setDescription] = useState(collection.description ?? "")
  const [topK, setTopK] = useState(String(collection.topK))
  const [scoreThreshold, setScoreThreshold] = useState(String(collection.scoreThreshold))
  const [chunkSize, setChunkSize] = useState(String(collection.chunkSize))
  const [chunkOverlap, setChunkOverlap] = useState(String(collection.chunkOverlap))
  const [isSaving, setIsSaving] = useState(false)

  const topKNum = Number(topK)
  const thresholdNum = Number(scoreThreshold)
  const sizeNum = Number(chunkSize)
  const overlapNum = Number(chunkOverlap)

  const valid =
    name.trim().length > 0 &&
    Number.isInteger(topKNum) && topKNum >= 1 && topKNum <= 20 &&
    Number.isFinite(thresholdNum) && thresholdNum >= 0 && thresholdNum <= 1 &&
    Number.isFinite(sizeNum) && sizeNum >= 64 &&
    Number.isFinite(overlapNum) && overlapNum >= 0 && overlapNum < sizeNum

  const save = async () => {
    if (!valid || isSaving) return
    setIsSaving(true)
    try {
      await updateRagCollection(deploymentId, collection.id, {
        name: name.trim(),
        description: description.trim() || null,
        topK: topKNum,
        scoreThreshold: thresholdNum,
        chunkSize: sizeNum,
        chunkOverlap: overlapNum,
      })
      toast.success("Collection updated")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update collection")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-5 pt-2 max-w-xl">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="set-name" className="text-xs">Name</Label>
          <Input
            id="set-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-desc" className="text-xs">Description</Label>
          <Textarea
            id="set-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this collection contains…"
            className="text-sm"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium">Retrieval</p>
          <p className="text-[11px] text-muted-foreground">
            Used by the chat on this page and by every agent connected to this
            collection.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="set-topk" className="text-xs">Top K results</Label>
            <Input
              id="set-topk"
              type="number"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-threshold" className="text-xs">Score threshold</Label>
            <Input
              id="set-threshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium">Chunking</p>
          <p className="text-[11px] text-muted-foreground">
            Applies to documents uploaded from now on — existing documents keep
            their current chunks.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="set-chunk" className="text-xs">Chunk size</Label>
            <Input
              id="set-chunk"
              type="number"
              min={64}
              value={chunkSize}
              onChange={(e) => setChunkSize(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-overlap" className="text-xs">Overlap</Label>
            <Input
              id="set-overlap"
              type="number"
              min={0}
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
        {Number.isFinite(sizeNum) && Number.isFinite(overlapNum) && overlapNum >= sizeNum && (
          <p className="text-[11px] text-destructive">
            Overlap must be smaller than chunk size.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={!valid || isSaving} size="sm" className="gap-1.5">
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save changes
        </Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <div>
          <p className="text-xs font-medium">Delete collection</p>
          <p className="text-[11px] text-muted-foreground">
            Removes the collection, its documents and its search index, and
            disconnects it from all agents.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          className="shrink-0 gap-1.5"
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    </div>
  )
}
