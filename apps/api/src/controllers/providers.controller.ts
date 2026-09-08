// apps/api/src/controllers/providers.controller.ts
import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { providerConnections, deployments } from "@llmpanel/db/schema"
import { createProvider } from "@llmpanel/providers"
import { encrypt, decrypt, aadFor } from "../services/encryption.service"
import { getCatalogAdapter } from "../services/catalog-adapters"
import { eq, and } from "drizzle-orm"
import { randomUUID } from "crypto"
import { env } from "../env"
import { getWorkspaceId } from "../lib/workspace-context"

// ── GET /api/v1/providers ────────────────────────────────────────────
export const getProviders = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)

  // Auto-seed local provider for self-hosted workspaces that have none
  if (env.DEPLOYMENT_MODE === "self-hosted") {
    const count = await db.$count(
      providerConnections,
      eq(providerConnections.workspaceId, workspaceId)
    )
    if (count === 0) {
      await db.insert(providerConnections).values({
        id: randomUUID(),
        userId: user.id,
        workspaceId,
        providerType: "local",
        name: "Local Docker",
        encryptedApiKey: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
      })
    }
  }

  const providers = await db.query.providerConnections.findMany({
    where: eq(providerConnections.workspaceId, workspaceId),
    columns: { encryptedApiKey: false },   // never expose encrypted key
  })

  // For each provider, try to get available GPUs
  const enriched = await Promise.all(
    providers.map(async (p) => {
      let availableGPUs: string[] = []
      try {
        const rawKey = p.providerType === "local"
          ? undefined
          : undefined // key stripped — just show connection status
        const provider = createProvider(p.providerType as any)
        availableGPUs = (await provider.listAvailableGPUs()).map((g) => g.type)
      } catch {
        // provider unreachable — show empty
      }
      return { ...p, availableGPUs }
    })
  )

  return c.json({ providers: enriched })
}

// ── POST /api/v1/providers ───────────────────────────────────────────
export const createProviderConnection = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const body = await c.req.json()
  const { name, type, apiKey, totpSecret } = body

  // Vast.ai only: optional TOTP secret to satisfy 2FA-gated write actions.
  const totp: string | undefined =
    type === "vastai" && typeof totpSecret === "string" && totpSecret.trim()
      ? totpSecret.trim()
      : undefined

  if (!name || !type) {
    return c.json({ error: "name and type are required" }, 400)
  }

  if (type !== "local" && !apiKey) {
    return c.json({ error: "apiKey is required for cloud providers" }, 400)
  }

  // Verify the API key works before saving
  if (apiKey) {
    try {
      const provider = createProvider(type, apiKey, totp)
      await provider.listAvailableGPUs()
    } catch (err) {
      console.error("Provider connection check failed:", err)
      return c.json({ error: "Could not connect with the provided API key" }, 400)
    }
  }

  // Row id is generated up front so the ciphertext can be AAD-bound to it.
  const providerId = randomUUID()
  const encryptedApiKey = apiKey ? await encrypt(apiKey, aadFor.providerApiKey(providerId)) : null
  const encryptedTotpSecret = totp ? await encrypt(totp, aadFor.providerTotpSecret(providerId)) : null

  // If this is first provider, make it default
  const existingCount = await db.$count(
    providerConnections,
    eq(providerConnections.workspaceId, workspaceId)
  )

  const [provider] = await db.insert(providerConnections).values({
    id: providerId,
    userId: user.id,
    workspaceId,
    providerType: type,
    name,
    encryptedApiKey,
    encryptedTotpSecret,
    isDefault: existingCount === 0,
    isActive: true,
    createdAt: new Date(),
  }).returning({
    id: providerConnections.id,
    name: providerConnections.name,
    providerType: providerConnections.providerType,
    isDefault: providerConnections.isDefault,
    isActive: providerConnections.isActive,
    createdAt: providerConnections.createdAt,
  })

  return c.json({ provider }, 201)
}

// ── GET /api/v1/providers/:id ────────────────────────────────────────
export const getProvider = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const provider = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
    columns: { encryptedApiKey: false },
  })

  if (!provider) {
    return c.json({ error: "Provider not found" }, 404)
  }

  return c.json({ provider })
}

// ── PUT /api/v1/providers/:id ────────────────────────────────────────
export const updateProvider = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")
  const body = await c.req.json()
  const { name, apiKey } = body

  const existing = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
  })

  if (!existing) {
    return c.json({ error: "Provider not found" }, 404)
  }

  const updateData: Partial<typeof providerConnections.$inferInsert> = {}
  if (name) updateData.name = name
  if (apiKey) updateData.encryptedApiKey = await encrypt(apiKey, aadFor.providerApiKey(id))

  await db.update(providerConnections)
    .set(updateData)
    .where(eq(providerConnections.id, id))

  return c.json({ success: true })
}

// ── DELETE /api/v1/providers/:id ─────────────────────────────────────
export const deleteProvider = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  // Check if provider has active deployments
  const activeDeployments = await db.query.deployments.findMany({
    where: and(
      eq(deployments.providerConnectionId, id),
      eq(deployments.status, "running")
    ),
    columns: { id: true },
  })

  if (activeDeployments.length > 0) {
    return c.json({
      error: `Cannot disconnect provider — ${activeDeployments.length} active deployment(s) running. Stop them first.`,
    }, 400)
  }

  await db.delete(providerConnections)
    .where(and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ))

  return c.json({ success: true })
}

// ── POST /api/v1/providers/:id/verify ───────────────────────────────
export const verifyProvider = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const providerRecord = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
  })

  if (!providerRecord) {
    return c.json({ error: "Provider not found" }, 404)
  }

  try {
    const apiKey = providerRecord.encryptedApiKey
      ? await decrypt(providerRecord.encryptedApiKey, aadFor.providerApiKey(providerRecord.id))
      : undefined

    const provider = createProvider(providerRecord.providerType as any, apiKey)
    const gpus = await provider.listAvailableGPUs()

    return c.json({
      valid: true,
      availableGPUs: gpus,
    })
  } catch (error) {
    return c.json({
      valid: false,
      error: error instanceof Error ? error.message : "Connection failed",
    })
  }
}

// ── GET /api/v1/providers/:id/gpus ───────────────────────────────────
export const getProviderGPUs = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const providerRecord = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
  })

  if (!providerRecord) {
    return c.json({ error: "Provider not found" }, 404)
  }

  try {
    const apiKey = providerRecord.encryptedApiKey
      ? await decrypt(providerRecord.encryptedApiKey, aadFor.providerApiKey(providerRecord.id))
      : undefined

    const provider = createProvider(providerRecord.providerType as any, apiKey)
    const gpus = await provider.listAvailableGPUs()

    return c.json({ gpus })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Failed to fetch GPUs",
    }, 500)
  }
}

// ── GET /api/v1/providers/:id/catalog ───────────────────────────────
export const getProviderCatalog = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const providerRecord = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
  })

  if (!providerRecord) {
    return c.json({ error: "Provider not found" }, 404)
  }

  if (!providerRecord.encryptedApiKey) {
    return c.json({ error: "No API key stored for this provider" }, 400)
  }

  const apiKey = await decrypt(providerRecord.encryptedApiKey, aadFor.providerApiKey(providerRecord.id))

  try {
    const adapter = getCatalogAdapter(providerRecord.providerType)
    if (!adapter) {
      return c.json({ offers: [] })
    }

    // Optional ?gpuCount= — stock/offers are per machine size on both
    // RunPod and Vast.ai. Omitted/invalid falls back to the adapter default.
    const rawGpuCount = Number(c.req.query("gpuCount"))
    const gpuCount =
      Number.isFinite(rawGpuCount) && rawGpuCount >= 1
        ? Math.min(Math.trunc(rawGpuCount), 8)
        : undefined

    const offers = await adapter.fetchCatalog(apiKey, { gpuCount })

    return c.json({
      provider: {
        id: providerRecord.id,
        name: providerRecord.name,
        providerType: providerRecord.providerType,
        isDefault: providerRecord.isDefault,
      },
      offers,
    })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Failed to fetch provider catalog",
    }, 502)
  }
}

// ── POST /api/v1/providers/:id/default ──────────────────────────────
export const setDefaultProvider = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const existing = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, id),
      eq(providerConnections.workspaceId, workspaceId)
    ),
    columns: { id: true },
  })

  if (!existing) {
    return c.json({ error: "Provider not found" }, 404)
  }

  // Unset all defaults in this workspace, then set the requested one
  await db.update(providerConnections)
    .set({ isDefault: false })
    .where(eq(providerConnections.workspaceId, workspaceId))

  await db.update(providerConnections)
    .set({ isDefault: true })
    .where(eq(providerConnections.id, id))

  return c.json({ success: true })
}
