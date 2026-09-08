"use client"

import { useState, useRef } from "react"
import { Upload, FileText, X, Loader2, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { uploadRagDocument } from "@/hooks/use-rag"
import { cn } from "@/lib/utils"

interface DocumentUploadProps {
  deploymentId: string
  collectionId: string
  onUploaded: () => void
}

interface UploadFile {
  file: File
  status: "pending" | "uploading" | "done" | "error"
  error?: string
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
]
const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm"]

export function DocumentUpload({
  deploymentId,
  collectionId,
  onUploaded,
}: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (newFiles: FileList | File[]) => {
    const validFiles = Array.from(newFiles).filter((file) => {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`
      return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
    })

    if (validFiles.length < newFiles.length) {
      toast.error("Some files were skipped — only .pdf, .txt, .md, .csv, .json, .html are supported")
    }

    setFiles((prev) => [
      ...prev,
      ...validFiles.map((file) => ({ file, status: "pending" as const })),
    ])
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setIsUploading(true)

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue

      setFiles((prev) =>
        prev.map((f, j) => (j === i ? { ...f, status: "uploading" } : f))
      )

      try {
        await uploadRagDocument(deploymentId, collectionId, files[i].file)
        setFiles((prev) =>
          prev.map((f, j) => (j === i ? { ...f, status: "done" } : f))
        )
      } catch (e) {
        setFiles((prev) =>
          prev.map((f, j) =>
            j === i
              ? {
                  ...f,
                  status: "error",
                  error: e instanceof Error ? e.message : "Upload failed",
                }
              : f
          )
        )
      }
    }

    setIsUploading(false)
    onUploaded()

    // Clear completed files after a delay
    setTimeout(() => {
      setFiles((prev) => prev.filter((f) => f.status !== "done"))
    }, 2000)
  }

  const pendingCount = files.filter((f) => f.status === "pending").length

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer",
          isDragging
            ? "border-violet-500 bg-violet-500/5"
            : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <Upload className="size-6 text-muted-foreground mb-2" />
        <p className="text-xs font-medium">
          Drop files here or click to browse
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          .pdf, .txt, .md, .csv, .json, .html
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{f.file.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(f.file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {f.status === "uploading" && (
                <Loader2 className="size-3.5 animate-spin text-violet-500" />
              )}
              {f.status === "done" && (
                <Check className="size-3.5 text-success" />
              )}
              {f.status === "error" && (
                <AlertCircle className="size-3.5 text-destructive" />
              )}
              {f.status === "pending" && (
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}

          {pendingCount > 0 && (
            <Button
              onClick={() => void handleUpload()}
              disabled={isUploading}
              size="sm"
              className="w-full gap-2"
            >
              {isUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Upload {pendingCount} file{pendingCount !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
