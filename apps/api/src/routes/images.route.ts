import { Hono } from "hono"
import { readGeneratedImage } from "../services/image-storage.service"

// Public, unauthenticated route that serves generated image files by name so
// they can be loaded directly in <img> tags. Filenames are random UUIDs, so the
// URL itself is the capability (same model as Replicate/fal output URLs).
export const imagesRoute = new Hono().get("/files/:name", async (c) => {
  const name = c.req.param("name")
  const file = await readGeneratedImage(name)

  if (!file) {
    return c.json({ error: "Image not found" }, 404)
  }

  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
})
