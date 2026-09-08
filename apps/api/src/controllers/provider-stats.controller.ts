import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { providerConnections } from "@llmpanel/db"
import { decrypt, aadFor } from "../services/encryption.service"
import { eq, and } from "drizzle-orm"
import {
  fetchStatsForProvider,
  isStatsCapableProvider,
  type ProviderStats,
} from "../services/provider-stats.service"

export type { ProviderInstance, ProviderStats } from "../services/provider-stats.service"
import { getWorkspaceId } from "../lib/workspace-context"

export const getProviderStats = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const record = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
  })

  if (!record) {
    return c.json({ error: "Provider not found" }, 404)
  }

  if (!record.encryptedApiKey) {
    return c.json({ error: "No API key stored for this provider" }, 400)
  }

  if (!isStatsCapableProvider(record.providerType)) {
    return c.json({ error: "Stats not available for this provider type" }, 400)
  }

  try {
    const apiKey = await decrypt(record.encryptedApiKey, aadFor.providerApiKey(record.id))
    const stats: ProviderStats = await fetchStatsForProvider(record.providerType, apiKey)
    return c.json({ stats })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to fetch provider stats" },
      502
    )
  }
}
