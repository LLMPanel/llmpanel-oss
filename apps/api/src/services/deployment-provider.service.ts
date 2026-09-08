// Shared provider resolution for a deployment row — used by the deployments
// routes, metrics controller, and the background metrics collector.
import { eq } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { providerConnections } from "@llmpanel/db/schema"
import { createProvider } from "@llmpanel/providers"
import type { IGPUProvider } from "@llmpanel/providers"
import { decrypt, aadFor } from "./encryption.service"
import { env } from "../env"

export type ProviderType = Parameters<typeof createProvider>[0]

export interface ProviderResolvable {
  providerType: string
  providerConnectionId: string | null
}

export async function resolveProvider(dep: ProviderResolvable): Promise<IGPUProvider> {
  if (env.MOCK_DEPLOYMENT) return createProvider("mock")

  const pc = dep.providerConnectionId
    ? await db.query.providerConnections.findFirst({
        where: eq(providerConnections.id, dep.providerConnectionId),
      })
    : null

  const apiKey = pc?.encryptedApiKey
    ? await decrypt(pc.encryptedApiKey, aadFor.providerApiKey(pc.id))
    : undefined
  return createProvider(dep.providerType as ProviderType, apiKey)
}
