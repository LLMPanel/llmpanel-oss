// apps/api/src/services/document-extract.service.ts
//
// Turns an uploaded file into plain text ready for chunking. PDFs go through
// unpdf (serverless-friendly build of pdf.js); everything else on the
// whitelist is read as UTF-8 text.

export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".html",
  ".htm",
] as const

export class UnsupportedFileError extends Error {
  constructor(fileName: string) {
    super(
      `Unsupported file type for "${fileName}" — supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
    )
    this.name = "UnsupportedFileError"
  }
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase()
}

export function isSupportedFile(fileName: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(fileName))
}

async function extractPdfText(file: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const buffer = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

/**
 * Extract plain text from an uploaded file.
 * @throws {UnsupportedFileError} when the extension is not on the whitelist
 * @throws {Error} when a PDF has no extractable text (scanned/image-only)
 */
export async function extractDocumentText(file: File): Promise<string> {
  const ext = extensionOf(file.name)
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new UnsupportedFileError(file.name)
  }

  const text = ext === ".pdf" ? await extractPdfText(file) : await file.text()

  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) {
    throw new Error(
      ext === ".pdf"
        ? "No extractable text found in this PDF (it may be scanned images)"
        : "File is empty"
    )
  }
  return normalized
}
