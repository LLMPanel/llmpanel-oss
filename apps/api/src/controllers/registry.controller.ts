import type { Context } from "hono"
import { filterCatalog, getRegistryCatalog } from "../services/model-registry.service"

// Filters are compared in memory, so this only bounds the work per request.
const MAX_FILTER_LENGTH = 100

function filterParam(c: Context, name: string): string | undefined {
  const value = c.req.query(name)?.trim().slice(0, MAX_FILTER_LENGTH)
  return value || undefined
}

// GET /api/v1/registry/models?family=&search=&tag= — the registry's GET /models,
// served from the API's cached copy of the catalog.
export const listRegistryModels = async (c: Context) => {
  try {
    const catalog = await getRegistryCatalog()
    return c.json(
      filterCatalog(catalog, {
        family: filterParam(c, "family"),
        search: filterParam(c, "search"),
        tag: filterParam(c, "tag"),
      })
    )
  } catch (err) {
    // Operators get the cause in the log; the dashboard gets a message it can show.
    console.error(`[registry] catalog unavailable: ${err instanceof Error ? err.message : String(err)}`)
    return c.json({ error: "The model registry is unreachable right now. Try again in a minute." }, 502)
  }
}
