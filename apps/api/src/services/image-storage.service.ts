import { mkdir, writeFile, readFile } from "fs/promises"
import { existsSync } from "fs"
import { join, resolve, extname, basename } from "path"
import { randomUUID } from "crypto"
import { env } from "../env"

// Absolute, resolved output directory for generated images.
const OUTPUT_DIR = resolve(env.IMAGE_OUTPUT_DIR)

async function ensureDir(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
  }
}

export interface SavedImage {
  filename: string
  path: string
  url: string
}

/**
 * Persist a base64-encoded image to local disk and return its public URL.
 * The URL points at the public static route mounted at `/api/v1/images/files`.
 */
export async function saveBase64Image(b64: string, ext = "png"): Promise<SavedImage> {
  await ensureDir()
  const filename = `${randomUUID()}.${ext}`
  const path = join(OUTPUT_DIR, filename)
  await writeFile(path, Buffer.from(b64, "base64"))

  const base = env.PUBLIC_API_URL.replace(/\/+$/, "")
  const url = `${base}/api/v1/images/files/${filename}`
  return { filename, path, url }
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

/**
 * Read a previously-saved image by filename. Returns null if the name is
 * unsafe or the file doesn't exist. Used by the public file-serving route.
 */
export async function readGeneratedImage(
  name: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  // Reject path traversal — only allow a bare filename.
  const safe = basename(name)
  if (safe !== name) return null

  const path = join(OUTPUT_DIR, safe)
  if (!existsSync(path)) return null

  const ext = extname(safe).toLowerCase()
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream"
  const body = await readFile(path)
  return { body, contentType }
}
